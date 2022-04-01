const net = require('net');
const server = net.createServer();
const strf = require('string');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http')
const https = require('https')
const pool = require('./dbConfig');

require('log-timestamp');
require('dotenv').config()
let { client, userWS, passWS, NODE_ENV } = process.env
console.log("Server : " + NODE_ENV);
const hostport = 3012;

evntCnt = 0;

process.on('uncaughtException', (error) => {
    console.log('error : ' + error);
});

//*****************************************************************
//******** Event Init *********************************************
//*****************************************************************
let EventEmitter = require('events');
const { exit } = require('process');
class HanaconsResponded extends EventEmitter { }
let hanaconsResponded = new HanaconsResponded();

//*****************************************************************
//******** HOST Init **********************************************
//*****************************************************************

server.listen({
    port: hostport,
    exclusive: true

});
console.log('server listening on ' + 'port: ' + hostport);

evntCnt = 0;

//*****************************************************************
//******** Socket Handler ( from HLI )*****************************
//*****************************************************************
server.on('connection', (e) => {

    let reading = false;
    let msgLen;
    let msgBuff = '';

    console.log('New Connection : ' + e.remoteAddress);
    //e.write( "Welcome to Hanacons" );

    e.setEncoding('utf8');
    e.setTimeout(60000); //1 Minute Timeout

    e.on('error', () => {
        console.log("ERROR ON :" + console.log(e))
    });
    e.on('end', (e) => {
        console.log("Server ended ==> " + e)
    })
    e.on('error', (e) => {
        console.log("ERROR ON e : " + e)
    });
    e.on('timeout', () => {
        console.log('Socket Timeout. Reseting.');
        hanaconsResponded.removeAllListeners('ppatkpepv2');
        e.end();
    });
    e.on('data', (buff) => {

        console.log("message: " + buff);
        console.log("len message: " + buff.length);
        msgLen = parseInt(buff.substring(0, 4));
        console.log("len comparation from message: " + msgLen);
        try {
            if (msgLen > 0) {
                if (buff.length) {
                    let incMsg = buff.split("|");
                    callPPATKv2(buff); //through forwarder
                } else {
                    //errornotmatchlength
                    let rmsg;
                    rmsg = buff.substring(304, 380);
                    rmsg = rmsg + "98";
                    rmsg = rmsg + buff.substring(382, 389);
                    rmsg = strf(rmsg.length + 4).padLeft(4, '0').s + rmsg;
                    console.log("Returning : " + rmsg);
                    e.write(rmsg);
                }
            }
        } catch (error) {
            console.log('error on socket -> ' + error)
        }
    });

    hanaconsResponded.on('ppatkpepv2', (f) => {
        e.write(f);
    });
});

async function queryDB(param) {
    return (param.action == 'insert') ? `INSERT INTO MDW_EOH_HIS (trx_id, bsns_cd, ref_id, sts, switch_id, url, methode, interval_tm, o_log_data, reg_emp_no, reg_dt, reg_tm, upd_emp_no)
            values ('${param.idTrx}', '${param.bsns_cd}', '${param.idTrx}', '0', 'PEPP', 
            '${param.url}', '${param.method}', '30', '${param.o_log_data}', 'OCP', current_date, current_time, 'OCP')` : 
            `update mdw_eoh_his 
            set recv_dt = current_date, sts='1', resp_cd = '${param.resp_cd}', recv_tm = current_time, resp_val = '${param.resp_val}', i_log_data = '${param.i_log_data}', upd_dt = current_date, upd_tm = current_time 
            where trx_id = '${param.idTrx}' and bsns_cd = '${param.bsns_cd}'`
}

async function inputDB(payload){
    try {
        clientPG = await pool.connect()
    } catch (error) {
        console.log(error);
    }

    if (clientPG != undefined){
        try {
            await clientPG.query(payload);
        } catch (err) {
            console.log(err);
        } finally {
            clientPG.off('error', (error) => console.log(error));
        }
    }

    if (clientPG != undefined){
        await clientPG.release()
    }
}

async function getToken(idTrx) {
    try {
        let insertStsToken = await queryDB({action: 'insert', idTrx, url: 'http://10.25.88.173:8080/api/auth', bsns_cd: 'AUT', method: 'POST', o_log_data: client})
        await inputDB(insertStsToken)

        let getToken = await axios({
            method: 'POST',
            url: `http://10.25.88.173:8080/api/auth`,
            auth: {
                username: userWS,
                password: passWS
            },
            headers: {
                client_id: client
            }
        })

        console.log(`${new Date()} => TOKEN GENERATED ${getToken.data.access_token}`);

        let updateStsToken = await queryDB({action: 'update', idTrx, resp_cd: `${getToken.data ? '00' : '99'}`, resp_val: `${getToken.data ? getToken.data.access_token : 'Generate Token Failed'}`, i_log_data: `${JSON.stringify(getToken.data ? getToken.data : {})}`, bsns_cd: 'AUT'})
        await inputDB(updateStsToken)

        return getToken.data.access_token
    } catch (error) {
        console.log(`${new Date()} => ERROR: ${error.response ? error.response.status : error} ${error.response ? error.response.data.message : ''}`);
        
        let errorStsToken = await queryDB({action: 'update', idTrx, resp_cd: `99`, resp_val: `${error.response ? error.response.data.message : error}`, i_log_data: `${JSON.stringify(error.response ? error.response.data.message : {})}`, bsns_cd: 'AUT'})
        await inputDB(errorStsToken)
    }
}



async function callPPATKv2(msg) {
    let img = msg.split("|")[2]
    let idTrx = msg.substring(374, 380)
    let token = await getToken(idTrx)

    console.log("msg ppatk: " + msg);
    let inpReqParam = msg.split("|")
    let nik = inpReqParam[1].trim()
    console.log(nik, 'NIK');

    let imsg;
    let f;
    if (nik === undefined || nik === '') {
        console.log('nik ga ada ppatk')
        f = { orig: inpReqParam[0], resp: { content: [{ RESPON: 'nik Empty' }] } };
        imsg = f.orig.substring(304, 380);
        if (f.resp.content[0].RESPON === "nik Empty") {
            imsg = imsg + "29";
        }
        imsg = imsg + f.orig.substring(382, 389);
        imsg = imsg + JSON.stringify({ 'message': 'NIK Empty' })
        imsg = strf(imsg.length + 4).padLeft(4, '0').s + imsg;
        console.log("Returning : " + imsg);
        hanaconsResponded.emit('ppatkpepv2', imsg);
        return;
    }
    if (nik.length !== 16
        || nik[0] === '0'
        || nik.substring(nik.length - 4, nik.length) === '0000'
        || isNaN(nik)
    ) {
        console.log('nik tidak sama 16')
        f = { orig: inpReqParam[0], resp: { content: [{ RESPON: 'Invalid nik' }] } };
        imsg = f.orig.substring(304, 380);
        if (f.resp.content[0].RESPON === "Invalid nik") {
            imsg = imsg + "19";
        }
        imsg = imsg + f.orig.substring(382, 389);
        imsg = imsg + JSON.stringify({ 'message': 'NIK Tidak 16 Digit' })
        imsg = strf(imsg.length + 4).padLeft(4, '0').s + imsg;
        console.log("Returning : " + imsg);
        hanaconsResponded.emit('ppatkpepv2', imsg);
        return;
    }

    let options = {
        path: `/api/v1/data/nik/${nik}`,
        host: '10.25.88.173',
        port: '8081',
        method: 'GET',
        headers: {
            'Authorization': 'Bearer ' + token,
        },
    };

    let insertStsData = await queryDB({action: 'insert', idTrx, url: `http://10.25.88.173:8081/api/v1/data/nik/${nik}`, bsns_cd: 'DAT', method: 'GET', o_log_data: nik})
    await inputDB(insertStsData)
    var post_req = http.request(options, function (res) {
        let imsg;
        res.setEncoding('utf8');
        res.on('data', async function (d) {
            console.log('response ' + d)
            try {
                tmpc = JSON.parse(d);
                f = { orig: inpReqParam[0], resp: tmpc };
            }
            catch (error) {
                console.log('Error On PPATK: ' + error)
                post_req.end()
            }
            let rmsg;
            if (f.resp.message == 'Data Found') {
                rmsg = f.orig.substring(304, 389);
                rmsg = rmsg + JSON.stringify(f.resp)
            } else if (f.resp.message == 'Data Not Found') {
                rmsg = f.orig.substring(304, 380);
                rmsg = rmsg + "09";
                rmsg = rmsg + f.orig.substring(382, 389);
                rmsg = rmsg + JSON.stringify({ 'message': 'Data Not Found' })
            } else if (f.resp.message == 'Invalid NIK Format') {
                rmsg = f.orig.substring(304, 380);
                rmsg = rmsg + "39";
                rmsg = rmsg + f.orig.substring(382, 389);
                rmsg = rmsg + JSON.stringify({ 'message': 'Invalid NIK Format' })
            } else if (f.resp.message == 'Token Unidentified' || f.resp.message == 'Authorization Failed') {
                rmsg = f.orig.substring(304, 380);
                rmsg = rmsg + "99";
                rmsg = rmsg + f.orig.substring(382, 389);
                rmsg = rmsg + JSON.stringify({ 'message': 'Token Unidentified' })
            } else if (f.resp.message == 'Client Reach Max Hits') {
                rmsg = f.orig.substring(304, 380);
                rmsg = rmsg + "49";
                rmsg = rmsg + f.orig.substring(382, 389);
                rmsg = rmsg + JSON.stringify({ 'message': 'Client Reach Max Hits' })
            } else {
                rmsg = f.orig.substring(304, 380);
                rmsg = rmsg + "50";
                rmsg = rmsg + f.orig.substring(382, 389);
                rmsg = rmsg + JSON.stringify({ 'message': 'Error' })
            }
            rmsg = strf(rmsg.length + 4).padLeft(4, '0').s + rmsg;
            console.log("Returning : " + rmsg);
            let updateStsData = await queryDB({action: 'update', idTrx, resp_cd: rmsg.substring(80, 82), resp_val: rmsg.substring(87), i_log_data: d, bsns_cd: 'DAT'})
            await inputDB(updateStsData)
            hanaconsResponded.emit('ppatkpepv2', rmsg);
        });
    })
    post_req.write(nik);
    post_req.end();
}
