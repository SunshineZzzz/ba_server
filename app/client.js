'use strict';

const print = console.log.bind(console.log);
const g = require('./global');
const net = require('net');
const config = require('config');
const netPacket = require('./common/netPacket');
const STSCmd = require('./config/STSCmd');
const rawLog = require('./config/rawLog');
let client = new net.Socket();
let host = config.has('app.tcpHost') ? config.get('app.tcpHost') : '127.0.0.1';
let port = config.has('app.tcpPort') ? config.get('app.tcpPort') : 19999;
// 是否可以发送原始日志
let canSendLog = false;
// timer
let timeSendHelloHandle = null;
// hello timeout
let nSendHelloTimeout = 1 * 1000

// 发起连接
client.connect(port, host, function() {
  console.log('game socket connect to %s:%s', host, port);
  timeSendHelloHandle = setInterval(() => {
    client.write(netPacket.packData(STSCmd.eSTS_INNERBA_HELLO, {
      grpId: 1001
    }));
  }, nSendHelloTimeout);
});

// 接收数据
client.on('data', function(data) {
  netPacket.unpackData(data, function (dataCmd, jsonStr) {
    // 无论收到什么，都说明可以发送日志了
    canSendLog = true;
    clearTimeout(timeSendHelloHandle);
    timeSendHelloHandle = null;
    
    if (dataCmd == STSCmd.eSTS_INNERBA_HELLO) {
      console.log('STS_IDIP_Hello: %s', jsonStr);
      // testInnerMsg();
      return;
    }

    let d = null;
    try {
      d = JSON.parse(jsonStr);
    } catch (e) {
      d = {};
    }

    console.log('jsonStr: %s', jsonStr);
  });
});

// 对端关闭
client.on('close', function() {
  console.log('Connection closed');
  canSendLog = false;
  process.exit(0);
});

// 对端异常
client.on('error', function(e) {
  console.error(e.stack);
  canSendLog = false;
  process.exit(0);
});

// 模拟发送日志
setInterval(()=>{
  if (canSendLog === false) {
    return;
  }
  for (var [id, log] of rawLog) {
    client.write(netPacket.packData(STSCmd.eSTS_INNERBA_DATA, {
      logId: id,
      logMsg: log
    }));
  }
}, 1000);

// 模拟发送内部请求
function testInnerMsg() {
  if (canSendLog === false) {
    return;
  }
  client.write(netPacket.packData(STSCmd.eSTS_INNERBA_INNER, {
    head: {
      grpId: 1001,
      cmdId: 1,
    },
    body: {
      msg: 'have a test for inner cmd'
    }
  }));
};