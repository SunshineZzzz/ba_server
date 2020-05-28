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

client.connect(port, host, function() {
  console.log('game socket connect to %s:%s', host, port);
  client.write(netPacket.packData(STSCmd.eSTS_INNERBA_HELLO, {
    grpId: 1001
  }));
});

client.on('data', function(data) {
  netPacket.unpackData(data, function (dataCmd, jsonStr) {
    if (dataCmd == STSCmd.eSTS_IDIP_Hello) {
      console.log('STS_IDIP_Hello: %s', jsonStr);
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

client.on('close', function() {
  console.log('Connection closed');
});

client.on('error', function(err) {
  console.log(err);
});

setInterval(()=>{
  for (var [id, log] of rawLog) {
    client.write(netPacket.packData(STSCmd.eSTS_INNERBA_DATA, {
      logId: id,
      logMsg: log
    }));
  }
}, 1000);
