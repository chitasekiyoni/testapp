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

async function getToken(idTrx) {
    try {

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

        return getToken
    } catch (error) {
        console.log(`${new Date()} => ERROR: ${error.response ? error.response.status : error} ${error.response ? error.response.data.message : ''}`);
        return error
    }
}

async function callPPATKv2(msg) {
    let client
    let clientError = null;

    try {
        client = await pool.connect()
    } catch (error) {
        console.log(error);
    }

    let trace_no = msg.substring(362, 368)
    let rrn = msg.substring(368, 380)

    console.log("msg ppatk: " + msg);
    let inpReqParam = msg.split("|")
    let nik = inpReqParam[1].trim()
    console.log(nik, 'NIK');

    if (client != undefined) {
        try {
            let o_log_auth_query = `INSERT INTO MDW_EOH_HIS (trx_id, bsns_cd, ref_id, sts, switch_id, trx_cd, hbs_trx_cd, url, methode, interval_tm, o_log_data, reg_emp_no, reg_dt, reg_tm, upd_emp_no, hbs_o_log_data)
            values ('${trace_no}', 'AUT', '${rrn}', '0', 'PATK', '#IQPATK', '#IQPATK',
            'http://10.25.88.173:8080/api/auth', 'POST', '30', ${nik ? nik : null}, 'OCP', current_date, current_time, 'OCP', null)`
            await client.query(o_log_auth_query);
        } catch (err) {
            clientError = err;
        } finally {
            client.off('error', (error) => console.log(error));
        }
    }

    //Internal Validation
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
        if (client != undefined) {
            try {
                let i_log_auth_query = `update mdw_eoh_his 
                set recv_dt = current_date, sts='1', resp_cd = '29', recv_tm = current_time, resp_val = ${`'${JSON.stringify({ 'message': 'NIK Empty' })}'`}, i_log_data = ${`'${JSON.stringify({ 'message': 'NIK Empty' })}'`}, upd_dt = current_date, upd_tm = current_time
                where trx_id = '${trace_no}' and bsns_cd = 'AUT' and switch_id = 'PATK' and trx_dt = current_date`
                await client.query(i_log_auth_query);
            } catch (err) {
                clientError = err;
            } finally {
                client.off('error', (error) => console.log(error));
            }
        }
        if (client != undefined) {
            await client.release()
        }
        hanaconsResponded.emit('ppatkpepv2', imsg);
        return;
    }
    if (nik.length !== 16
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
        if (client != undefined) {
            try {
                let i_log_auth_query = `update mdw_eoh_his 
                set recv_dt = current_date, sts='1', resp_cd = '19', recv_tm = current_time, resp_val = ${`'${JSON.stringify({ 'message': 'NIK Tidak 16 Digit' })}'`}, i_log_data = ${`'${JSON.stringify({ 'message': 'NIK Tidak 16 Digit' })}'`}, upd_dt = current_date, upd_tm = current_time
                where trx_id = '${trace_no}' and bsns_cd = 'AUT' and switch_id = 'PATK' and trx_dt = current_date`
                await client.query(i_log_auth_query);
            } catch (err) {
                clientError = err;
            } finally {
                client.off('error', (error) => console.log(error));
            }
        }
        if (client != undefined) {
            await client.release()
        }
        hanaconsResponded.emit('ppatkpepv2', imsg);
        return;
    }

    //Check token if existing
    let checkToken
    let token
    if (client != undefined) {
        try {
            checkToken =  await client.query(`select auth_token from peppatk_token where trx_dt = current_date order by trx_tm desc limit 1;`);
        } catch (err) {
            clientError = err;
        } finally {
            client.off('error', (error) => console.log(error));
        }
    }

    if (!checkToken || checkToken.rows.length == 0){
         // If Token not Found, New Generate
         console.log('Token not found, Getting Token Data ...');
         token = await getToken() 
         
         if (client != undefined) {
             try {
                 let i_log_auth_query = `update mdw_eoh_his 
                 set recv_dt = current_date, sts='1', resp_cd = ${token.data ? `'00'` : `'99'`}, recv_tm = current_time, resp_val = '${token.data ? token.data.access_token : 'Generate Token Failed'}', i_log_data =  ${token.data ? `'${JSON.stringify(token.data)}'` : token ? `'${token}'` : 'null'} , upd_dt = current_date, upd_tm = current_time
                 where trx_id = '${trace_no}' and bsns_cd = 'AUT' and switch_id = 'PATK' and trx_dt = current_date`
                 let saveToken = `insert into peppatk_token (auth_token) values ('${token ? JSON.stringify({data: token.data ? token.data : 'Generate Token Failed'}) : 'Generate Token Failed'}');`
                 await client.query(i_log_auth_query);
                 await client.query(saveToken)  
             } catch (err) {
                 clientError = err;
             } finally {
                 client.off('error', (error) => console.log(error));
             }
         }
    } else {
        // If Token Found
        token = JSON.parse(checkToken.rows[0].auth_token)
        console.log('Token Found:', token.data ? token.data.access_token : 'Unidentified Token');
    }

    let tokenAuth = token.data && token.data.access_token
    if (client != undefined) {
        try {
            let o_log_data_query = `INSERT INTO MDW_EOH_HIS (trx_id, bsns_cd, ref_id, sts, switch_id, trx_cd, hbs_trx_cd, url, methode, interval_tm, o_log_data, reg_emp_no, reg_dt, reg_tm, upd_emp_no, hbs_o_log_data)
            values ('${trace_no}', 'DAT', '${rrn}', '0', 'PATK', '#IQPATK', '#IQPATK',
            'http://10.25.88.173:8081/api/v1/data/nik/${nik}', 'GET', '30', '${nik}', 'OCP', current_date, current_time, 'OCP', '${msg}');`
            await client.query(o_log_data_query);
        } catch (err) {
            clientError = err;
        } finally {
            client.off('error', (error) => console.log(error));
        }
    }

    let rmsg;
    let orig = inpReqParam[0];

    try {
        let sendData = await axios({
            method: 'GET',
            url: `http://10.25.88.173:8081/api/v1/data/nik/${nik}`,
            headers: {
                'Authorization': 'Bearer ' + tokenAuth
            }
        })
        
        console.log(sendData.data)
        if (sendData.data.message == 'Data Found') {
            rmsg = orig.substring(304, 389);
            rmsg = rmsg + JSON.stringify(sendData.data)
        } else {
            rmsg = orig.substring(304, 380);
            rmsg = rmsg + "50";
            rmsg = rmsg + orig.substring(382, 389);
            rmsg = rmsg + JSON.stringify({ 'message': 'Error' })
        }
        rmsg = strf(rmsg.length + 4).padLeft(4, '0').s + rmsg;
        console.log("Returning : " + rmsg);

        if (client != undefined) {
            try {
                let i_log_data_query = `update mdw_eoh_his 
                set recv_dt = current_date, sts='1', resp_cd = '${rmsg.substring(80, 82)}', recv_tm = current_time, resp_val = '${rmsg.substring(89)}', i_log_data = '${JSON.stringify(sendData.data)}', upd_dt = current_date, upd_tm = current_time, hbs_i_log_data = '${rmsg}'
                where trx_id = '${trace_no}' and bsns_cd = 'DAT' and switch_id = 'PATK' and trx_dt = current_date`
                await client.query(i_log_data_query);
            } catch (err) {
                clientError = err;
            } finally {
                client.off('error', (error) => console.log(error));
            }
        }
        if (client != undefined) {
            await client.release()
        }
        hanaconsResponded.emit('ppatkpepv2', rmsg);

    } catch (error) {
        console.log(`E: ${error.response ? error.response.status : error} ${error.response ? error.response.data.message : ''}`);
        if (error.response) {
            if (error.response.data.message == 'Data Not Found') {
                rmsg = orig.substring(304, 380);
                rmsg = rmsg + "09";
                rmsg = rmsg + orig.substring(382, 389);
                rmsg = rmsg + JSON.stringify({ 'message': 'Data Not Found' })
            } else if (error.response.data.message == 'Invalid NIK Format') {
                rmsg = orig.substring(304, 380);
                rmsg = rmsg + "39";
                rmsg = rmsg + orig.substring(382, 389);
                rmsg = rmsg + JSON.stringify({ 'message': 'Invalid NIK Format' })
            } else if (error.response.data.message == 'Token Unidentified' || error.response.data.message == 'Authorization Failed') {
                rmsg = orig.substring(304, 380);
                rmsg = rmsg + "99";
                rmsg = rmsg + orig.substring(382, 389);
                rmsg = rmsg + JSON.stringify({ 'message': 'Token Unidentified' })
            } else if (error.response.data.message == 'Client Reach Max Hits') {
                rmsg = orig.substring(304, 380);
                rmsg = rmsg + "49";
                rmsg = rmsg + orig.substring(382, 389);
                rmsg = rmsg + JSON.stringify({ 'message': 'Client Reach Max Hits' })
            } else {
                rmsg = orig.substring(304, 380);
                rmsg = rmsg + "50";
                rmsg = rmsg + orig.substring(382, 389);
                rmsg = rmsg + JSON.stringify({ 'message': 'Error' })
            }
        } else {
            rmsg = orig.substring(304, 380);
            rmsg = rmsg + "50";
            rmsg = rmsg + orig.substring(382, 389);
            rmsg = rmsg + JSON.stringify({ 'message': 'Error' })
        }

        rmsg = strf(rmsg.length + 4).padLeft(4, '0').s + rmsg;
        console.log("Returning : " + rmsg);       

        if (client != undefined) {
            try {
                // If Token Unidentified, New Generate and Save
                if (rmsg.substring(80, 82) == '99') {
                    try {
                        token = await getToken() 
                        let i_log_auth_query = `update mdw_eoh_his 
                        set recv_dt = current_date, sts='1', resp_cd = ${token.data ? `'00'` : `'99'`}, recv_tm = current_time, resp_val = '${token.data ? token.data.access_token : 'Generate Token Failed'}', i_log_data =  ${token.data ? `'${JSON.stringify(token.data)}'` : token ? `'${token}'` : 'null'} , upd_dt = current_date, upd_tm = current_time
                        where trx_id = '${trace_no}' and bsns_cd = 'AUT' and switch_id = 'PATK' and trx_dt = current_date`
                        let saveToken = `insert into peppatk_token (auth_token) values ('${token ? JSON.stringify({data: token.data ? token.data : 'Generate Token Failed'}) : 'Generate Token Failed'}');`
                        console.log('New Token Saved!');
                        await client.query(i_log_auth_query);
                        await client.query(saveToken)
                    } catch (error) {
                        console.log(error);
                    }
                }

                let i_log_data_query = `update mdw_eoh_his 
                set recv_dt = current_date, sts='1', resp_cd = '${rmsg.substring(80, 82)}', recv_tm = current_time, resp_val = '${rmsg.substring(89)}', i_log_data = '${error.response ? JSON.stringify(error.response.data) : error}', upd_dt = current_date, upd_tm = current_time, hbs_i_log_data = '${rmsg}'
                where trx_id = '${trace_no}' and bsns_cd = 'DAT' and switch_id = 'PATK' and trx_dt = current_date`
                await client.query(i_log_data_query);
            } catch (err) {
                clientError = err;
            } finally {
                client.off('error', (error) => console.log(error));
            }
        }
        if (client != undefined) {
            await client.release()
        }
        hanaconsResponded.emit('ppatkpepv2', rmsg);
        return error
    }
}
