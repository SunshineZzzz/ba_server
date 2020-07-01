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
    this.isStart = false;
  }
  setStart(start) {
    this.isStart = start;
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
      this.worker.connected && 
      this.worker.exitCode === null && 
      this.isStart);
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
    // 这里一定要注意！设计好客户端与服务器的连接通信！
    // The optional sendHandle argument that may be passed to subprocess.send() is for passing 
    // a TCP server or socket object to the child process. 
    // The child will receive the object as the second argument passed to the callback function 
    // registered on the 'message' event. 
    // ** Any data that is received and buffered in the socket will not be sent to the child. **
    return this.worker.send('socket', socket, {keepOpen: false});
  }
  sendMsg(msg) {
    if (this.isWork()) {
      this.worker.send(msg);
    }
  }
}

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
  // worker退出
  worker.on('exit', (code, signal) => {
    workerObj.incrRestart(code);
    logger.error('worker-' + worker.pid + ' died with code:' 
      + code + ',signal:' + signal + ',nRestart:' + workerObj.nRestart 
      + ',nMaxRestart:' + workerObj.nMaxRestart);

    if (workerObj.allowRestart()) {
      this.startWork(nodeExecPath, index)
    }
  });
  // worker错误
  worker.on('error', (err) => {
    logger.error(`worker-${wk.pid} error: ${err.stack}`)
  });
  // worker消息
  worker.on('message', (msg) => {
    workerObj.setStart(true);
  });
};

// 轮询分发工作
master.roundRobinWorker = function (tcpServer) {
  let cur = 0;
  tcpServer.on('connection', (socket) => {
    // 发送的时候，会造成master无法操作socket
    // 所以这里先判断一次 isWork
    if (this.arrWorkers[cur].isWork()) {
      this.arrWorkers[cur].sendSocket(socket)
    } else {
      // 说明worker还没有启动好，所以关闭连接请求
      socket.destroy();
    }
    cur = Number.parseInt((cur + 1) % cpuNum);
  });
};

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