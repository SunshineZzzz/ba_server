'use strict';

global.isMaster = true;
const g = require('../global');
const net = require('net');
const config = require('config');
const logger = require('../common/logger');
const master = require('./master');
const heartBeat = require('../common/heartBeat');

function init() {
  const nodeExecPath = g.APP_PATH + 'app/worker/main.js';
  let tcpHost = config.has('app.tcpHost') ? config.get('app.tcpHost') : '127.0.0.1';
  let tcpPort = config.has('app.tcpPort') ? config.get('app.tcpPort') : 19999;
  let tcpServer = net.createServer();

  if(!master.initWorkers(nodeExecPath)) {
     logger.error(`initWorkers error,%s`, nodeExecPath);
     return;
  }
  master.roundRobinWorker(tcpServer);
  heartBeat.setWorkers(master.arrWorkers);
  tcpServer.listen(tcpPort, tcpHost, () => {
    logger.info(`Tcp Server: ${tcpHost}:${tcpPort}`);
  });
}

init();

require('../process');