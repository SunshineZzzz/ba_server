'use strict';

const fs = require('fs');
const config = require('config');
const childProcess = require('child_process');
const eixtCode = require('../common/errorCode').eixtCode;
const logger = require('../common/logger');
const nMaxRestart = (config.has('app.nMaxRestart') && config.get('app.nMaxRestart') >= 0) ? 
  config.get('app.nMaxRestart') : 10;
const cpuNum = (config.has('app.workerNum') && config.get('app.workerNum') > 0) ? 
  config.get('app.workerNum') : common.getCpuNum();

let master = {
  arrWorkers: []
};

// worker对象
class Worker {
  constructor(worker, index, nMaxRestart) {
    this.worker = worker;
    this.index = index;
    this.nMaxRestart = nMaxRestart;
    this.nRestart = 0;
    this.lastCode = 0;
  }
  incrRestart(code, signal) {
    this.nRestart += 1;
    this.worker = null;
    this.lastCode = code || 0;
  }
  setWorker(worker) {
    this.worker = worker;
  }
  getWorker() {
    return this.worker;
  }
  isWork() {
    return (this.worker !== null && 
      this.worker.connected && this.worker.exitCode === null);
  }
  allowRestart() {
    if (this.isWork()) {
      return false;
    }

    if (eixtCode.hbErr === this.lastCode || eixtCode.startErr === this.lastCode) {
      return false;
    }
    
    if (this.nMaxRestart > 0 && this.nRestart >= this.nMaxRestart) {
      return false;
    }
    
    return true;
  }
  sendSocket(socket) {
    if (this.isWork()) {
      this.worker.send('socket', socket, {keepOpen: false});
    }
  }
  sendMsg(msg) {
    if (this.isWork()) {
      this.worker.send(msg);
    }
  }
};

// worker启动
master.startWork = function (nodeExecPath, index) {
  if (!fs.existsSync(nodeExecPath)) {
    return false;
  }
  if (index === undefined) {
    return false;
  }
  let worker = childProcess.fork(nodeExecPath);
  let workerObj = this.arrWorkers[index];
  if (workerObj === undefined) {
    this.arrWorkers[index] = new Worker(worker, index, nMaxRestart);
    workerObj = this.arrWorkers[index];
  } else {
    workerObj.setWorker(worker);
  }

  worker.on('exit', (code, signal) => {
    workerObj.incrRestart(code);
    logger.error('worker-' + worker.pid + ' died with code:' 
      + code + ',signal:' + signal + ',nRestart:' + workerObj.nRestart 
      + ',nMaxRestart:' + workerObj.nMaxRestart);

    if (workerObj.allowRestart()) {
      this.startWork(nodeExecPath, index)
    }
  });
  worker.on('error', (err) => {
    logger.error(`worker-${wk.pid} error: ${err.stack}`)
  });
};

// 轮询分发工作
master.roundRobinWorker = function (tcpServer) {
  let cur = 0;
  tcpServer.on('connection', (socket) => {
    this.arrWorkers[cur].sendSocket(socket);
    cur = Number.parseInt((cur + 1) % cpuNum);
  });
}

// 初始化所有worker
master.initWorkers = function (nodeExecPath) {
  for (let i = 0; i < cpuNum; ++i) {
    if(this.startWork(nodeExecPath, i) === false) {
      return false;
    }
  }
  return true;
};

module.exports = master;