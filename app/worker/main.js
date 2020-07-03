'use strict';

global.isMaster = false;
global.print = console.log.bind(console);
const exitCode = require('../common/errorCode').exitCode;
const network = require('../common/network');
const logger = require('../common/logger');
const heartBeat = require('../common/heartBeat');
const getlogXmlParse = require('../common/logXmlParse');

async function init() {
  let start = new Date().getTime();
  let logParse = await getlogXmlParse();
  let end = new Date().getTime();
  process.on('message', (msg, obj) => {
    if (msg.indexOf('socket|') !== -1) {
      if (obj) {
        obj.remoteAddressAndPort = msg.split('|')[1];
        network.handleConnection(logParse, obj);
      }
    } else if (msg === 'heartBeat') {
      heartBeat.updateTime();
    }
  });
  logger.info('create worker success, getlogXmlParse execute %d ms', (end - start));
  start = null;
  end = null;
}

init().then(() => {
  // 启动没问题告诉master
  process.send('workerStart');
}).catch((e) => {
  logger.error(e.stack);
  process.exit(exitCode.startErr);
});

require('../process');