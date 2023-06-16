module.exports = {

    checkenv: function (environ) {
        if (environ === 'development') {
            return {
                "client": "dev",
                "passWS": "dev",
                "userWS": "dev",
                "ppatkGetTokenURL": "http://10.25.88.208:30744",
                "ppatkGetDataURL": "http://10.25.88.208:30744",
                "pgHost": "http://dev-postgrest-api.apps.ocp-dc.hanabank.co.id",
                "pgOutgoing": "mdw_eoh_his",
                "pgIncoming": "mdw_eih_his",
                "ppatkToken": "peppatk_token"
            }
        }
        else if (environ === "production") {
            return {
                "client": "keb_hana",
                "passWS": "b9e6h4n4",
                "userWS": "bkebhana",
                "ppatkGetTokenURL": "http://10.25.88.173:8080",
                "ppatkGetDataURL": "http://10.25.88.173:8081",
                "pgHost": "http://idc-postgrest-api.apps.ocp-dc.hanabank.co.id",
                "pgOutgoing": "mdw_eoh_his",
                "pgIncoming": "mdw_eih_his",
                "ppatkToken": "peppatk_token"
            }
        }
    }
};
