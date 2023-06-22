const net = require('net');
const server = net.createServer();
const strf = require('string');
const axios = require('axios');
const env_var = require('./env_var');
require('dotenv').config()
require('log-timestamp');
const node_env = env_var.checkenv(process.env.NODE_ENV);
const tokenPG = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYWRtaW5fdXNlciJ9.TJPuhKy1q_3BWhgHv76tcM5lYEtDPQOiyy6WrZ7LaUs'
const hostport = 3012;
console.log("Server : " + process.env.NODE_ENV);
console.log(node_env);

evntCnt = 0;

process.on('uncaughtException', (error) => {
    console.log('error : ' + error);
});

// *****************************************************************
// ******** Event Init *********************************************
// *****************************************************************
let EventEmitter = require('events');
const { exit, send } = require('process');
class HanaconsResponded extends EventEmitter { }
let hanaconsResponded = new HanaconsResponded();

// *****************************************************************
// ******** HOST Init **********************************************
// *****************************************************************

server.listen({
    port: hostport,
    exclusive: true

});
console.log('server listening on ' + 'port: ' + hostport);

evntCnt = 0;

// *****************************************************************
// ******** Socket Handler ( from HLI )*****************************
// *****************************************************************
server.on('connection', (e) => {

    let reading = false;
    let msgLen;
    let msgBuff = '';

    console.log('New Connection : ' + e.remoteAddress);
    // e.write( "Welcome to Hanacons" );

    e.setEncoding('utf8');
    e.setTimeout(60000); // 1 Minute Timeout

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
                    callPPATKv2(buff); // through forwarder
                } else {
                    // errornotmatchlength
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

// *****************************************************************
// ******** Function Date ******************************************
// *****************************************************************
function getDateTime() {
    // Mendapatkan waktu saat ini dalam zona waktu "Asia/Jakarta"
    const currentTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });

    // Memisahkan tanggal dan waktu
    const [date, time] = currentTime.split(', ');

    // Mendapatkan tanggal dalam format yyyy-mm-dd
    const [month, day, year] = date.split('/');
    const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

    // Mendapatkan waktu dalam format hh:mm:ss
    const formattedTime = time;

    return {
        getDate: formattedDate,
        getTime: formattedTime,
        currentTimeD: currentTime
    };
}

// *****************************************************************
// ******** Function Encode Hash URL *******************************
// *****************************************************************
// Mengencode simbol '#' menjadi %23 untuk kebutuhan pengiriman pada url
function encodeHashInURL(url) {
    return url.replace(/#/g, '%23');
}


// *****************************************************************
// ******** Function Insert DB *************************************
// *****************************************************************
async function insertLogData(data) {

    try {
        // Menginisialisasi data tanggal dan waktu insert data
        const insertDateTime = getDateTime();
        console.log(insertDateTime.currentTimeD, `Insert to DB: ${data.trx_id}, ${data.trx_cd}`);
        data.trx_dt = insertDateTime.getDate
        data.trx_tm = insertDateTime.getTime
        data.reg_dt = insertDateTime.getDate
        data.reg_tm = insertDateTime.getTime

        // Menginput data transaksi ke dalam log postgres
        const insertPG = await axios({
            method: 'post',
            url: `${node_env["pgHost"]}/${node_env["pgOutgoing"]}`,
            headers: {
                Prefer: 'return=representation',
                Authorization: `Bearer ${tokenPG}`
            },

            data: data
        })

        // Lakukan sesuatu dengan hasil respons (insertPG) di sini
        return insertPG

    } catch (error) {
        // Tangani error yang mungkin terjadi di sini
        console.log(error, '<===== Insert DB PG');
    }
}

// *****************************************************************
// ******** Function Insert Reusable Token DB **********************
// *****************************************************************
async function insertReusableToken(data) {
    try {
        // Menginput token yang didapat dari PPATK ke DB untuk digunakan kembali pada transaksi berikutnya
        const insertTokenPG = await axios({
            method: 'post',
            url: `${node_env["pgHost"]}/${node_env["ppatkToken"]}`,
            headers: {
                Prefer: 'return=representation',
                Authorization: `Bearer ${tokenPG}`
            },

            data: data
        })

        // Mengembalikan hasil response didapat
        return insertTokenPG

    } catch (error) {
        // Tangani error yang mungkin terjadi di sini
        console.log(error, '<===== Error Insert Reusable Token PG');
    }
}

// *****************************************************************
// ******** Function Update DB *************************************
// *****************************************************************
async function updateLogData(data) {
    try {
        // Menginisialisasi data tanggal dan waktu update data
        const updateDateTime = getDateTime();
        console.log(updateDateTime.currentTimeD, `Update to DB: ${data.trx_id}, ${data.trx_cd}`);
        data.recv_dt = updateDateTime.getDate
        data.recv_tm = updateDateTime.getTime
        data.upd_dt = updateDateTime.getDate
        data.upd_tm = updateDateTime.getTime

        // Mengupdate data transaksi ke dalam log postgres
        const updatePG = await axios({
            method: 'patch',
            url: `${node_env["pgHost"]}/${node_env["pgOutgoing"]}?trx_id=eq.${data.trx_id}&bsns_cd=eq.${data.bsns_cd}&switch_id=eq.${data.switch_id}&trx_cd=eq.${encodeHashInURL(data.trx_cd)}&trx_dt=eq.${data.upd_dt}&resp_cd=is.null`,
            headers: {
                Prefer: 'return=representation',
                Authorization: `Bearer ${tokenPG}`
            },
            data: data
        })

        // Mengembalikan hasil response didapat
        return updatePG
    } catch (error) {
        // Tangani error yang mungkin terjadi di sini
        console.log(error, "<===== Error Update DB PG");
    }
}


// *****************************************************************
// ******** Function Get Token PPATK *******************************
// *****************************************************************
async function getTokenPATK() {
    try {
        // Mengirim permintaan token ke PPATK
        let getToken = await axios({
            method: 'POST',
            url: `${node_env["ppatkGetTokenURL"]}/api/auth`,
            auth: {
                username: node_env["userWS"],
                password: node_env["passWS"]
            },
            headers: {
                client_id: node_env["client"]
            }
        })

        console.log(`${new Date()} => TOKEN GENERATED ${getToken.data.access_token}`);

        // Mengembalikan hasil response didapat
        return getToken
    } catch (error) {
        // Tangani error yang mungkin terjadi di sini
        console.log(`${new Date()} => ERROR: ${error.response ? error.response.status : error} ${error.response ? error.response.data.message : ''}`);
        return error
    }
}

async function callPPATKv2(msg) {
    // Inisialisasi data yang diperlukan
    let trace_no = msg.substring(362, 368)
    let rrn = msg.substring(368, 380)
    let switch_id = msg.substring(29, 33)
    let trx_cd = msg.substring(382, 389)
    console.log("msg ppatk: " + msg);
    let inpReqParam = msg.split("|")
    let nik = inpReqParam[1].trim()
    console.log(nik, 'NIK');

    // Internal Validation
    let imsg;
    let f;
    // Validation NIK Empty
    if (nik === undefined || nik === '') {
        // Mapping response
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

        try {
            // Menginput data transaksi ke dalam log postgres
            let insertPG = await insertLogData({
                "trx_id": trace_no,
                "bsns_cd": "AUT",
                "ref_id": rrn,
                "sts": "1",
                "switch_id": switch_id,
                "trx_cd": trx_cd,
                "resp_cd": "29",
                "resp_val": JSON.stringify({ 'message': 'NIK Empty' }),
                "recv_dt": null,
                "recv_tm": null,
                "resnd_dt": null,
                "resnd_tm": null,
                "resnd_cnt": 0,
                "hbs_trx_cd": trx_cd,
                "url": `${node_env["ppatkGetTokenURL"]}/api/auth`,
                "hbs_o_log_data": null,
                "methode": "POST",
                "timer_cd": null,
                "interval_tm": "30",
                "reg_emp_no": "OCP",
                "upd_emp_no": "OCP",
                "upd_dt": null,
                "upd_tm": null,
                "o_log_data": nik ? nik : null,
                "i_log_data": JSON.stringify({ 'message': 'NIK Empty' })
            })
            console.log('inserted DB PPATK NIK Empty =>', insertPG.data[0] ? insertPG.data[0].ref_id : 'nodata')
        } catch (error) {
            // Tangani error yang mungkin terjadi di sini
            console.log(error.message ? error.message : error);
        }
        // Memberikan response kepada socket
        hanaconsResponded.emit('ppatkpepv2', imsg);
        return;
    }

    // Validation NIK Not 16 Digit
    if (nik.length !== 16
        || nik.substring(nik.length - 4, nik.length) === '0000'
        || isNaN(nik)
    ) {
        console.log('nik tidak sama 16')
        // Mapping response
        f = { orig: inpReqParam[0], resp: { content: [{ RESPON: 'Invalid nik' }] } };
        imsg = f.orig.substring(304, 380);
        if (f.resp.content[0].RESPON === "Invalid nik") {
            imsg = imsg + "19";
        }
        imsg = imsg + f.orig.substring(382, 389);
        imsg = imsg + JSON.stringify({ 'message': 'NIK Tidak 16 Digit' })
        imsg = strf(imsg.length + 4).padLeft(4, '0').s + imsg;
        console.log("Returning : " + imsg);

        // Menginput data transaksi ke dalam log postgres
        try {
            let insertPG = await insertLogData({
                "trx_id": trace_no,
                "bsns_cd": "AUT",
                "ref_id": rrn,
                "sts": "1",
                "switch_id": switch_id,
                "trx_cd": trx_cd,
                "resp_cd": "19",
                "resp_val": JSON.stringify({ 'message': 'NIK Tidak 16 Digit' }),
                "recv_dt": null,
                "recv_tm": null,
                "resnd_dt": null,
                "resnd_tm": null,
                "resnd_cnt": 0,
                "hbs_trx_cd": trx_cd,
                "url": `${node_env["ppatkGetTokenURL"]}/api/auth`,
                "hbs_o_log_data": null,
                "methode": "POST",
                "timer_cd": null,
                "interval_tm": "30",
                "reg_emp_no": "OCP",
                "upd_emp_no": "OCP",
                "upd_dt": null,
                "upd_tm": null,
                "o_log_data": nik ? nik : null,
                "i_log_data": JSON.stringify({ 'message': 'NIK Tidak 16 Digit' })
            })
            console.log('inserted DB PPATK NIK Tidak 16 Digit =>', insertPG.data[0] ? insertPG.data[0].ref_id : 'nodata')
        } catch (error) {
            // Tangani error yang mungkin terjadi di sini
            console.log(error.message ? error.message : error);
        }

        // Memberikan response kepada socket
        hanaconsResponded.emit('ppatkpepv2', imsg);
        return;
    }

    // Pengecekan apakah reusabletoken sudah tersedia di DB
    const checkTokenDateTime = getDateTime();
    let checkToken = await axios({
        method: 'get',
        url: `${node_env["pgHost"]}/peppatk_token?select=auth_token&trx_dt=eq.${checkTokenDateTime.getDate}&order=trx_tm.desc&limit=1`,
    })
    checkToken = checkToken.data.length > 0 ? JSON.parse(checkToken.data[0].auth_token) : ''
    let token

    if (!checkToken || !checkToken.data.access_token || checkToken.length == 0) {
        // Jika token tidak ditemukan, meminta token baru
        console.log('Token not found, Getting Token Data ...');
        token = await getTokenPATK()
        try {
            // Menginput transaksi autentikasi ke dalam log postgres
            let insertPG = await insertLogData({
                "trx_id": trace_no,
                "bsns_cd": "AUT",
                "ref_id": rrn,
                "sts": "1",
                "switch_id": switch_id,
                "trx_cd": trx_cd,
                "resp_cd": token.data ? '00' : '99',
                "resp_val": token.data ? token.data.access_token : 'Generate Token Failed',
                "recv_dt": null,
                "recv_tm": null,
                "resnd_dt": null,
                "resnd_tm": null,
                "resnd_cnt": 0,
                "hbs_trx_cd": trx_cd,
                "url": `${node_env["ppatkGetTokenURL"]}/api/auth`,
                "hbs_o_log_data": null,
                "methode": "POST",
                "timer_cd": null,
                "interval_tm": "30",
                "reg_emp_no": "OCP",
                "upd_emp_no": "OCP",
                "upd_dt": null,
                "upd_tm": null,
                "o_log_data": nik ? nik : null,
                "i_log_data": token.data ? `'${JSON.stringify(token.data)}'` : token ? `'${token}'` : 'null'
            })
            console.log('inserted DB PPATK Get Token =>', insertPG.data[0] ? insertPG.data[0].ref_id : 'nodata')
        } catch (error) {
            // Tangani error yang mungkin terjadi di sini
            console.log(error.message ? error.message : error);
        }

        // Menginput reusable token ke dalam log postgres
        try {
            let insertReuseableTokenPG = await insertReusableToken({
                auth_token: token ? JSON.stringify({ data: token.data ? token.data : 'Generate Token Failed' }) : 'Generate Token Failed'
            })
            console.log('inserted DB PPATK Reusable Token')
        } catch (error) {
            console.log(error);
        }
    } else {
        // Jika token tersedia di DB akan digunakan untuk transaksi
        token = checkToken
        console.log('Token Found:', token.data ? token.data.access_token : 'Unidentified Token');
    }
    let tokenAuth = token.data && token.data.access_token

    // Menginput data transaksi ke dalam log postgres
    try {
        let insertPG = await insertLogData({
            "trx_id": trace_no,
            "bsns_cd": "DAT",
            "ref_id": rrn,
            "sts": "0",
            "switch_id": switch_id,
            "trx_cd": trx_cd,
            "resp_cd": null,
            "resp_val": null,
            "recv_dt": null,
            "recv_tm": null,
            "resnd_dt": null,
            "resnd_tm": null,
            "resnd_cnt": 0,
            "hbs_trx_cd": trx_cd,
            "url": `${node_env["pgHost"]}/peppatk_token?select=auth_token&trx_dt=eq.${checkTokenDateTime.getDate}&order=trx_tm.desc&limit=1`,
            "methode": "GET",
            "timer_cd": null,
            "interval_tm": "30",
            "reg_emp_no": "OCP",
            "upd_emp_no": "OCP",
            "upd_dt": null,
            "upd_tm": null,
            "o_log_data": nik ? nik : null,
            "i_log_data": null,
            "hbs_o_log_data": msg
        })
        console.log('inserted DB PPATK GET DATA =>', insertPG.data[0] ? insertPG.data[0].ref_id : 'nodata')
    } catch (error) {
        // Tangani error yang mungkin terjadi di sini
        console.log(error.message ? error.message : error);
    }

    let rmsg;
    let orig = inpReqParam[0];

    // Mengirim data ke PPATK
    try {
        let dataPATK = await axios({
            method: 'GET',
            url: `${node_env["ppatkGetDataURL"]}/api/v1/data/nik/${nik}`,
            headers: {
                'Authorization': 'Bearer ' + tokenAuth
            }
        })

        // Mapping response
        console.log(dataPATK.data)
        if (dataPATK.data.message == 'Data Found') {
            rmsg = orig.substring(304, 389);
            rmsg = rmsg + JSON.stringify(dataPATK.data)
        } else {
            rmsg = orig.substring(304, 380);
            rmsg = rmsg + "50";
            rmsg = rmsg + orig.substring(382, 389);
            rmsg = rmsg + JSON.stringify({ 'message': 'Error' })
        }
        rmsg = strf(rmsg.length + 4).padLeft(4, '0').s + rmsg;
        console.log("Returning : " + rmsg);

        // Mengupdate data transaksi ke dalam log postgres
        try {
            let updatePG = await updateLogData({
                trx_id: trace_no,
                bsns_cd: "DAT",
                switch_id: switch_id,
                trx_cd: trx_cd,
                sts: "1",
                i_log_data: JSON.stringify(dataPATK.data),
                resp_cd: rmsg.substring(80, 82),
                resp_val: rmsg.substring(89),
                hbs_i_log_data: rmsg
            })
            console.log('updated DB PPATK GET DATA =>', updatePG.data[0] ? updatePG.data[0].ref_id : 'nodata')
        } catch (error) {
            // Tangani error yang mungkin terjadi di sini
            console.log(error.message ? error.message : error);
        }

        // Memberikan response kepada socket
        hanaconsResponded.emit('ppatkpepv2', rmsg);

    } catch (error) {
        // Mapping response jika data tidak ditemukan
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


        // Jika response 'Token Unidentified', generate token baru dan simpan ke DB reusable token
        if (rmsg.substring(80, 82) == '99') {
            try {

                // Mengirim permintaan token ke PPATK
                token = await getTokenPATK()
                try {
                    // Menginput transaksi autentikasi ke dalam log postgres
                    let insertPG = await insertLogData({
                        "trx_id": trace_no,
                        "bsns_cd": "AUT",
                        "ref_id": rrn,
                        "sts": "1",
                        "switch_id": switch_id,
                        "trx_cd": trx_cd,
                        "resp_cd": token.data ? '00' : '99',
                        "resp_val": token.data ? token.data.access_token : 'Generate Token Failed',
                        "recv_dt": null,
                        "recv_tm": null,
                        "resnd_dt": null,
                        "resnd_tm": null,
                        "resnd_cnt": 0,
                        "hbs_trx_cd": trx_cd,
                        "url": `${node_env["ppatkGetTokenURL"]}/api/auth`,
                        "hbs_o_log_data": null,
                        "methode": "POST",
                        "timer_cd": null,
                        "interval_tm": "30",
                        "reg_emp_no": "OCP",
                        "upd_emp_no": "OCP",
                        "upd_dt": null,
                        "upd_tm": null,
                        "o_log_data": nik ? nik : null,
                        "i_log_data": token.data ? `'${JSON.stringify(token.data)}'` : token ? `'${token}'` : 'null'
                    })
                    console.log('inserted DB PPATK Get Token =>', insertPG.data[0] ? insertPG.data[0].ref_id : 'nodata')
                } catch (error) {
                    // Tangani error yang mungkin terjadi di sini
                    console.log(error.message ? error.message : error);
                }

                // Menginput token yang didapat dari PPATK ke DB untuk digunakan kembali pada transaksi berikutnya
                try {
                    let insertReuseableTokenPG = await insertReusableToken({
                        auth_token: token ? JSON.stringify({ data: token.data ? token.data : 'Generate Token Failed' }) : 'Generate Token Failed'
                    })
                    console.log('inserted DB PPATK Reusable Token')
                } catch (error) {
                    // Tangani error yang mungkin terjadi di sini
                    console.log(error);
                }
            } catch (error) {

                // Tangani error yang mungkin terjadi di sini
                console.log(error);
            }
        }

        try {
            // Mengupdate data transaksi ke dalam log postgres
            let updatePG = await updateLogData({
                trx_id: trace_no,
                bsns_cd: "DAT",
                switch_id: switch_id,
                trx_cd: trx_cd,
                sts: "1",
                i_log_data: error.response ? JSON.stringify(error.response.data) : error,
                resp_cd: rmsg.substring(80, 82),
                resp_val: rmsg.substring(89),
                hbs_i_log_data: rmsg
            })
            console.log('updated DB PPATK GET DATA =>', updatePG.data[0] ? updatePG.data[0].ref_id : 'nodata')
        } catch (error) {

            // Tangani error yang mungkin terjadi di sini
            console.log(error.message ? error.message : error);
        }
        // Memberikan response kepada socket
        hanaconsResponded.emit('ppatkpepv2', rmsg);
        return error
    }
}
