'use strict';

const _ = require('underscore');
const STSCmd = require('../config/STSCmd');

// 数据包结构
let netPacket = {
  packet: {
    minSize: 4,
    dataSize: {
      size: 4,
    },
    dataCmd: {
      size: 2,
    },
    data: {
    },
  },
};

// 解析baclient发来的数据包
netPacket.unpackData = function (chunk, dealDataCb, dealWaitDataCb) {
  let idx = 0;
  let idx0 = idx;
  let chunkLen = chunk.length;
  while (idx < chunkLen) {
    idx0 = idx;
    if (idx + this.packet.minSize > chunkLen) {
      // 数据太短了
      if (dealWaitDataCb) {
        dealWaitDataCb(chunk.slice(idx0));
      }
      return;
    }
    let dataSize = chunk.readUInt32LE(idx);
    idx += this.packet.dataSize.size;
    if (idx + dataSize > chunkLen) {
      // 数据不够长
      if (dealWaitDataCb) {
        dealWaitDataCb(chunk.slice(idx0));
      }
      return;
    }
    let dataCmd = chunk.readUInt16LE(idx);
    idx += this.packet.dataCmd.size;
    let jsonStr = dataSize - this.packet.dataCmd.size;
    let data = chunk.slice(idx, idx + jsonStr);
    idx += jsonStr;
    if (dealDataCb) {
      dealDataCb(dataCmd, data.toString());
    }
  }
};

// 打包数据
netPacket.packData = function (dataCmd, jsonData) {
  let jsonStr = JSON.stringify(jsonData);

  let dataSizeBuf = Buffer.alloc(this.packet.dataSize.size);
  let dataCmdBuf = Buffer.alloc(this.packet.dataCmd.size);
  let dataBuf = Buffer.from(jsonStr);
  dataSizeBuf.writeUInt32LE(dataBuf.length + this.packet.dataCmd.size);
  dataCmdBuf.writeUInt16LE(dataCmd);
  let buf = Buffer.concat([dataSizeBuf, dataCmdBuf, dataBuf]);
  dataSizeBuf = null;
  dataCmdBuf = null;
  dataBuf = null;

  return buf;
};

module.exports = netPacket;