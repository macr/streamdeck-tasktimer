/* global $CC, Utils, $SD */

/**
 * The 'connected' event is sent to your plugin, after the plugin's instance
 * is registered with Stream Deck software. It carries the current websocket
 * and other information about the current environmet in a JSON object
 * You can use it to subscribe to events you want to use in your plugin.
 */

$SD.on('connected', (jsonObj) => connected(jsonObj));

function connected(jsn) {
    // Subscribe to the willAppear and other events
    $SD.on('com.macr.streamdeck.tasktimer.action.willAppear', (jsonObj) => action.onWillAppear(jsonObj));
    $SD.on('com.macr.streamdeck.tasktimer.action.willDisappear', (jsonObj) => action.onWillDisappear(jsonObj));
    $SD.on('com.macr.streamdeck.tasktimer.action.keyDown', (jsonObj) => action.onKeyDown(jsonObj));
    $SD.on('com.macr.streamdeck.tasktimer.action.keyUp', (jsonObj) => action.onKeyUp(jsonObj));
    $SD.on('com.macr.streamdeck.tasktimer.action.didReceiveSettings', (jsonObj) => action.onDidReceiveSettings(jsonObj));
    $SD.on('com.macr.streamdeck.tasktimer.action.propertyInspectorDidAppear', (jsonObj) => {
        console.log('%c%s', 'color: white; background: black; font-size: 13px;', '[app.js]propertyInspectorDidAppear:');
    });
    $SD.on('com.macr.streamdeck.tasktimer.action.propertyInspectorDidDisappear', (jsonObj) => {
        console.log('%c%s', 'color: white; background: red; font-size: 13px;', '[app.js]propertyInspectorDidDisappear:');
    });
}

// ACTIONS

const action = {
    timers: {},
   onDidReceiveSettings: function (jsn) {
        console.log('[app.js]onDidReceiveSettings', jsn);
     
        if (this.timers[jsn.context]) {
            this.timers[jsn.context].updateSettings(jsn.payload.settings);
        }
    },

    onWillAppear: function (jsn) {
        console.log('onWillAppear', jsn.payload.settings);
        let ctx = jsn.context;
        if (!this.timers[ctx]) {
            this.timers[ctx] = new Timer(jsn);
        } else {
            this.timers[ctx].updateSettings(jsn.payload.settings);
            this.timers[ctx].render();
        }
    },
    onWillDisappear: function (jsn) {
        console.log('onWillDisappear', jsn.context);
    },
    onKeyDown: function (jsn) {
        let ctx = jsn.context
        let timer = this.timers[ctx]
        if (!timer) return;

        // Clear any existing timeouts from previous presses
        if (timer.longPressTimeout) {
            clearTimeout(timer.longPressTimeout)
            timer.longPressTimeout = null
        }
        if (timer.blinkFeedbackTimeout) {
            clearTimeout(timer.blinkFeedbackTimeout)
            timer.blinkFeedbackTimeout = null
        }

        timer.wasResetDuringLongPress = false
        timer.longPressTimeout = setTimeout(() => {
            timer.wasResetDuringLongPress = true
            timer.resetTimer()
            // Blink once as feedback using configured color
            $SD.api.setImage(ctx, new SvgUrl(timer.config.blinkingColor).getUrl())
            timer.blinkFeedbackTimeout = setTimeout(() => {
                $SD.api.setImage(ctx, '')
                timer.blinkFeedbackTimeout = null
            }, 150)
        }, 1200)
    },
    onKeyUp: function (jsn) {
        const ctx = jsn.context
        const timer = this.timers[ctx]
        if (!timer) return;

        clearTimeout(timer.longPressTimeout)
        timer.longPressTimeout = null

        if (timer.wasResetDuringLongPress) {
            timer.wasResetDuringLongPress = false
            return
        }

        switch (timer.status) {
            case timerStatus.STANDBY:
                timer.startTimer()
                break
            case timerStatus.RUNNING:
                timer.pauseTimer()
                break
            case timerStatus.PAUSED:
                timer.startTimer()
                break
            case timerStatus.FINISHED:
                timer.resetTimer()
                break
            default:
                break
        }
    },
};

const timerStatus = Object.freeze({
    STANDBY: Symbol(0),
    RUNNING: Symbol(1),
    PAUSED: Symbol(2),
    FINISHED: Symbol(3),
})

class Timer {
    constructor(jsn) {
        console.log('new Timer', this)
        this.context = jsn.context
        this.status = timerStatus.STANDBY
        this.config = {
            timerSec: 900,
            alarmSound: 'None',
            alarmVolume: 20,
            alarmBlinkEnabled: false,
            blinkingColor: '#606060',
        }
        this.updateSettings(jsn.payload.settings)

        this.remainingSec = this.config.timerSec
        this.updateTitle(this.config.timerSec)
    }

    updateSettings(settings) {
        console.log('updateSettings', this)
        if (!settings) {
            return
        }

        if (settings.hasOwnProperty('timersec')) {
            this.config.timerSec = parseInt(settings.timersec, 10)
            if (this.status === timerStatus.STANDBY) {
                this.remainingSec = this.config.timerSec
                this.updateTitle(this.config.timerSec)
            }
        }

        if (settings.hasOwnProperty('alarmSound')) {
            this.config.alarmSound = settings.alarmSound
        }

        if (settings.hasOwnProperty('alarmVolume')) {
            this.config.alarmVolume = parseInt(settings.alarmVolume, 10)
        }

        if (settings.hasOwnProperty('alarmBlinkEnabled')) {
            this.config.alarmBlinkEnabled = settings.alarmBlinkEnabled === 'true'
        }

        if (settings.hasOwnProperty('blinkingColor')) {
            this.config.blinkingColor = settings.blinkingColor
        }
    }

    startTimer() {
        console.log('startTimer', this)

        // Clear existing interval if any
        if (this.countdown) {
            clearInterval(this.countdown)
        }

        this.updateBackground()
        this.countdown = setInterval(function () {
            console.log('tick')

            this.remainingSec--
            this.updateTitle(this.remainingSec)
            this.updateBackground()
            if (this.remainingSec <= 0) {
                this.finishTimer(this.context)
            }
        }.bind(this), 1000)
        this.status = timerStatus.RUNNING
    }

    pauseTimer() {
        console.log('pauseTimer', this)

        clearInterval(this.countdown)
        this.countdown = null
        this.status = timerStatus.PAUSED
    }

    finishTimer() {
        console.log('finishTimer', this)

        if (this.countdown) {
            clearInterval(this.countdown)
            this.countdown = null
        }

        if (this.config.alarmBlinkEnabled) {
            $SD.api.setImage(this.context, new SvgUrl(this.config.blinkingColor).getUrl())
            this.blinking = true
            this.blinkInterval = setInterval(function () {
                const newColor = this.blinking ? '#000000' : this.config.blinkingColor
                $SD.api.setImage(this.context, new SvgUrl(newColor).getUrl())
                this.blinking = !this.blinking
            }.bind(this), 500)
        }

        if (this.config.alarmSound && this.config.alarmSound !== 'None') {
            const sound = new Audio('action/sounds/' + this.config.alarmSound)
            sound.volume = this.config.alarmVolume / 100.0
            sound.loop = true
            sound.play()
            this.sound = sound
        }

        this.status = timerStatus.FINISHED
    }

    resetTimer() {
        console.log('resetTimer', this)

        if (this.countdown) {
            clearInterval(this.countdown)
            this.countdown = null
        }
        if (this.blinkInterval) {
            clearInterval(this.blinkInterval)
            this.blinkInterval = null
        }
        if (this.sound) {
            this.sound.pause()
            this.sound.src = ''
            this.sound.load()
            this.sound = null
        }
        $SD.api.setImage(this.context, '')
        this.updateTitle(this.config.timerSec)
        this.remainingSec = this.config.timerSec
        this.status = timerStatus.STANDBY
    }

    cleanup() {
        console.log('cleanup', this)

        if (this.countdown) {
            clearInterval(this.countdown)
            this.countdown = null
        }
        if (this.blinkInterval) {
            clearInterval(this.blinkInterval)
            this.blinkInterval = null
        }
        if (this.blinkFeedbackTimeout) {
            clearTimeout(this.blinkFeedbackTimeout)
            this.blinkFeedbackTimeout = null
        }
        if (this.longPressTimeout) {
            clearTimeout(this.longPressTimeout)
            this.longPressTimeout = null
        }
        if (this.sound) {
            this.sound.pause()
            this.sound.src = ''
            this.sound.load()
            this.sound = null
        }
    }

    updateTitle(sec) {
        console.log('updateTitle', sec)
        const mm = ('00' + Math.floor(sec / 60)).slice(-2)
        const ss = ('00' + (sec % 60)).slice(-2)
        $SD.api.setTitle(this.context, mm + ':' + ss)
    }

    updateBackground() {
        $SD.api.setImage(this.context, new SvgUrl(getRunningColor(this.remainingSec, this.config.timerSec)).getUrl())
    }

    render() {
        switch (this.status) {
            case timerStatus.STANDBY:
                $SD.api.setImage(this.context, '')
                this.updateTitle(this.config.timerSec)
                break
            case timerStatus.RUNNING:
            case timerStatus.PAUSED:
                this.updateTitle(this.remainingSec)
                this.updateBackground()
                break
            case timerStatus.FINISHED:
                this.updateTitle(0)
                if (!this.config.alarmBlinkEnabled) {
                    this.updateBackground()
                }
                break
            default:
                break
        }
    }
}

const runningColorStart = {r: 0, g: 255, b: 0}
const runningColorEnd = {r: 255, g: 0, b: 0}

function getRunningColor(remainingSec, totalSec) {
    const progress = getElapsedRatio(remainingSec, totalSec)
    return rgbToHex({
        r: interpolateColorChannel(runningColorStart.r, runningColorEnd.r, progress),
        g: interpolateColorChannel(runningColorStart.g, runningColorEnd.g, progress),
        b: interpolateColorChannel(runningColorStart.b, runningColorEnd.b, progress),
    })
}

function getElapsedRatio(remainingSec, totalSec) {
    if (totalSec <= 0) {
        return 1
    }
    return Math.min(Math.max((totalSec - remainingSec) / totalSec, 0), 1)
}

function interpolateColorChannel(startValue, endValue, progress) {
    return Math.round(startValue + ((endValue - startValue) * progress))
}

function rgbToHex(rgb) {
    return '#' + [rgb.r, rgb.g, rgb.b].map((channel) => channel.toString(16).padStart(2, '0')).join('')
}

class SvgUrl {
    constructor(rgbStr) {
        this.rgbStr = rgbStr
    }

    getUrl() {
        return 'data:image/svg+xml;charset=utf8,<svg width="144" height="144" xmlns="http://www.w3.org/2000/svg"><rect stroke="'
            + this.rgbStr
            + '" id="svg_1" height="144" width="144" y="0" x="0" fill="'
            + this.rgbStr
            + '"/></svg>'
    }
}
