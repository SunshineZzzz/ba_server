'use strict';

const _ = require('underscore');
const config = require('config');
const log4js = require('log4js');
const exitCode = require('./errorCode').exitCode;

// master心跳
class HeartBeatMaster {
  constructor() {
    this.nSHBInterval = config.has('hb.mSendInterval') ? config.get('hb.mSendInterval') : 10 * 1000;
    this.nSHBInterval = this.nSHBInterval <= 0 ? 10 * 1000 : this.nSHBInterval;
    this.arrWorkers = null;
    this.timerHBObj = null;
  }
  setWorkers(arrWorkers) {
    this.arrWorkers = arrWorkers;

    this.timerHBObj = setInterval(this.sendHeartBeat.bind(this), this.nSHBInterval);
  }
  sendHeartBeat() {
    if (this.arrWorkers === null) {
      return;
    }
    for (let workerObj of this.arrWorkers) {
      workerObj.sendMsg('heartBeat');
    }
  }
  closeTimer() {
    if (this.timerHBObj) {
      clearInterval(this.timerHBObj);
      this.timerHBObj = null;
    }
  }
}

// worker心跳
class HeartBeatWorker {
  constructor() {
    this.lastDataTime = Date.now();
    this.nHBCheckInterval = config.has('hb.wCheckInterval') ? config.get('hb.wCheckInterval') : 10 * 1000;
    this.nHBCheckInterval = this.nHBCheckInterval <= 0 ? 10 * 1000 : this.nHBCheckInterval;
    this.nHBTimeout = config.has('hb.wTimeout') ? config.get('hb.wTimeout') : 120 * 1000;
    this.nHBTimeout = this.nHBTimeout <= 0 ? 120 * 1000 : this.nHBTimeout;
    this.timerHBObj = null;

    this.timerHBObj = setInterval(this.doHBCheck.bind(this), this.nHBCheckInterval);
  }
  updateTime() {
    this.lastDataTime = Date.now();
  }
  doHBCheck() {
    let timeout = Date.now() - this.lastDataTime;
    if (timeout > this.nHBTimeout && _.isUndefined(process.channel)) {
      console.error('Master process has been down, timeout: %d', timeout);
      this.closeTimer();
      common.workExit(exitCode.hbErr);
    }
  }
  closeTimer() {
    if (this.timerHBObj) {
      clearInterval(this.timerHBObj);
      this.timerHBObj = null;
    }
  }
}

module.exports = global.isMaster ? new HeartBeatMaster() : new HeartBeatWorker();