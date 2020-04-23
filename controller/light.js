const hlp = require('./../helper');
const configCtrl = require('./config');
const colorConst = require('./../color');
const socketEventCtrl = require('./event');
const eventConst = require('./../event');

class LightAdmin {
    constructor() {
        this.ws281x = require('rpi-ws281x-native');
        this.ws281x.init(configCtrl.getNumberOfLights(), {});
        this.ws281x.setBrightness(configCtrl.getDefaultBrightness());

        this.lightsCollection = [];
        this.timeoutCollection = [];
        this.clear();

        this.registerSocketEvent();
    }

    registerSocketEvent() {
        socketEventCtrl.on(eventConst.EVENT_MESSAGE_PICK_BOX_PICK, (pickBoxIdent) => {
            console.log('got pick box pick event', pickBoxIdent);
            let lights = configCtrl.getBoxLightCollection(pickBoxIdent),
                lightColor = configCtrl.getBoxColor(pickBoxIdent);
            console.log(lights, lightColor);

            if (lights) {
                for (let i = 0; i < lights.length; i++) {
                    this.blink(lights[i], lightColor);
                }
            }
        });
    }

    /**
     * checks if given lamp index is in range
     *
     * @param index the index to check
     * @returns {*|boolean}
     */
    static checkIndexInRange(index) {
        return hlp.isNumeric(index) && index >= 0 && index <= (configCtrl.getNumberOfLights() - 1);
    }

    /**
     * checks if given brightness is in range
     *
     * @param brightness the brightness to check
     * @returns {*|boolean}
     */
    static checkBrightness(brightness) {
        return hlp.isNumeric(brightness) && brightness >= 0 && brightness <= configCtrl.getMaxBrightness();
    }

    /**
     * clears the whole strip
     */
    clear() {
        this.clearTimeouts();
        for (let i = 0; i < configCtrl.getNumberOfLights(); i++) {
            this.lightsCollection[i] = colorConst.COLOR_OFF;
        }

        this._render();
    }

    /**
     * delete all cached timeouts
     */
    clearTimeouts() {
        this.timeoutCollection.forEach((n) => {
            clearTimeout(n);
        })
    }

    /**
     * sets the brightness globally
     *
     * @param brightness the brightness in in (0 - MAX_BRIGHTNESS)
     */
    setBrightness(brightness) {
        if (!this.constructor.checkBrightness(brightness)) {
            throw new Error('invalid brightness');
        }

        this.ws281x.setBrightness(brightness);
    }

    /**
     * flash the lights to indicate a system error
     */
    indicateSystemInitError() {
        this.clearTimeouts();
        this._systemInitErrorBlink(true);
    }

    /**
     * system error indicator routine
     *
     * @param switchOn blink active
     * @private
     */
    _systemInitErrorBlink(switchOn) {
        console.log('_systemInitErrorBlink', switchOn);
        if (switchOn) {
            for (let i = 0; i < configCtrl.getNumberOfLights(); i++) {
                this.lightsCollection[i] = colorConst.COLOR_RED;
            }
            this._render();

        } else {
            for (let i = 0; i < configCtrl.getNumberOfLights(); i++) {
                this.lightsCollection[i] = colorConst.COLOR_OFF;
            }
            this._render();
        }

        let timeout = setTimeout(() => {
            this._systemInitErrorBlink(!switchOn)
        }, 500);
        this.timeoutCollection.push(timeout);
    }

    /**
     * indicates the system is booted up successful
     */
    indicateSystemInitSuccess() {
        this.clearTimeouts();
        this._systemInitSuccess(0);
    }

    /**
     * system success indicator routine
     *
     * @param index which light to show
     * @private
     */
    _systemInitSuccess(index) {
        if (this.constructor.checkIndexInRange(index)) {
            if (this.constructor.checkIndexInRange(index - 1)) {
                this.lightsCollection[index - 1] = colorConst.COLOR_OFF;
            }
            this.lightsCollection[index] = colorConst.COLOR_GREEN;
            this._render();

            setTimeout(() => {
                this._systemInitSuccess(index + 1);
            }, 150);

            return;
        }

        setTimeout(() => {
            for (let i = 0; i < configCtrl.getNumberOfLights(); i++) {
                this.lightsCollection[i] = colorConst.COLOR_OFF;
            }
            this._render();
        }, 150);
    }

    full() {
        for (let i = 0; i < configCtrl.getNumberOfLights(); i++) {
            this.lightOn(i, colorConst.COLOR_WHITE, false);
        }
    }

    /**
     * switches on a lamp at given indev
     *
     * @param index the lamps index
     * @param color the color code as int (see COLOR_)
     * @param clearOther default true
     */
    lightOn(index, color, clearOther = true) {
        if (!this.constructor.checkIndexInRange(index)) {
            throw new Error('invalid index');
        }

        if (clearOther) {
            this.clear();
        }
        this.lightsCollection[index] = color;
        this._render();
    }

    /**
     * switches off a lamp at given index
     *
     * @param index the lamps index
     * @param clearOther default true
     */
    lightOff(index, clearOther = true) {
        if (!this.constructor.checkIndexInRange(index)) {
            throw new Error('invalid index');
        }

        if (clearOther) {
            this.clear();
        }
        this.lightsCollection[index] = colorConst.COLOR_OFF;
        this._render();
    }

    /**
     * toggles a single light
     *
     * @param index the lamps index to toggle
     * @param color the color code as int (see COLOR_)
     */
    toggleLight(index, color) {
        const light = this.lightsCollection[index];
        if (light !== colorConst.COLOR_OFF) {
            this.lightOff(index);
            return false;
        } else {
            this.lightOn(index, color || colorConst.COLOR_EXITB);
            return true;
        }
    }

    /**
     * let a light blink
     *
     * @param index the lights index
     * @param color the lights color
     * @param numOfBlinks number of blinks
     * @param blinkTimeout blinking timeout
     */
    blink(index, color, numOfBlinks, blinkTimeout) {
        this.clearTimeouts();
        this._blink(
            index,
            color || configCtrl.getBoxColor(),
            numOfBlinks || configCtrl.getBlinkingCount(),
            blinkTimeout || configCtrl.getBlinkingTimeout()
        );
    }

    /**
     * lets get the party started
     *
     * @param index the lamps index
     * @param color the blinking color, default = COLOR_EXITB
     * @param numOfBlinks number of blink intervals, default = 10
     * @param blinkTimeout timeout of blinks
     */
    _blink(index, color, numOfBlinks, blinkTimeout) {
        console.log('blink', index, color, numOfBlinks, blinkTimeout);
        if (this.toggleLight(index, color)) {
            numOfBlinks -= 1;
        }

        if (numOfBlinks > 0) {
            let timeout = setTimeout(() => {
                this._blink(index, color, numOfBlinks, blinkTimeout)
            }, blinkTimeout);
            this.timeoutCollection.push(timeout);
        } else {
            setTimeout(() => {
                this.lightOff(index)
            }, blinkTimeout);
        }
    }

    /**
     * renders the current light configuration
     *
     * @private
     */
    _render() {
        console.log('rendering lights', this.lightsCollection);
        let ws281Lights = new Uint32Array(this.lightsCollection);
        this.ws281x.render(ws281Lights);
    }
}

const lightAdmin = new LightAdmin();
module.exports = lightAdmin;