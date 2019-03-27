window.jQuery = window.$ = require('./jquery-3.3.1.min.js');
const prompt = require('electron-prompt');
// Electron
const {
    remote,
    ipcRenderer,
    shell
} = require('electron');
const {
    app,
    Menu,
    BrowserWindow
} = remote;
const Net = require('net')
var liveInfomation;
var handleNames = {}
if (localStorage.handleNames) {
    handleNames = JSON.parse(localStorage.handleNames)
}
var nanasiindex = 0;
var tcpTarget = localStorage.tcpTarget || '127.0.0.1:50001'
var tcpSocket = null;
var loadFirst = true;
const baseURL = 'https://i-quiz-colopl-jp.akamaized.net/img/card/small/'
var noImageTable = [{
    name: "ゼルプスト(火闇) ",
    image: 'N3zReM_card_12292_0.png',
    count: 0
}, {
    name: 'メカガトリン ',
    image: 'card_09857_0.png',
    count: 0
}, {
    name: '野良ナース ',
    image: 'card_07261_0.png',
    count: 0
}, {
    name: 'ウィズ? ',
    image: 'WkFi5T_card_10308_0.png',
    count: 0
}]
var noImageList = {};

function appendComment({
    message,
    name,
    id
}, noread) {
    var readMessage = message;
    var id = "" + id
    var imageUrl = `http://usericon.nimg.jp/usericon/${id.slice(0,-4)}/${id}.jpg`
    var noImageUrl = noImageList[id];
    if (!noImageUrl) {
        noImageUrl = noImageTable[Math.floor(Math.random() * noImageTable.length)].image;
        noImageList[id] = noImageUrl
    }
    var $comment = $('<div class="comment"/>');
    var $nameWrap = $('<div class="name-wrap"/>');
    var $name = $('<div class="name"/>');
    var $textWrap = $('<div class="text-wrap"/>');
    var $text = $('<div class="text"></div>');
    var $image = $(`<img class="icon" src="${imageUrl}" onerror="this.src='${baseURL+noImageUrl}'">`)
    var url;

    $name.text(name);
    $text.text(message);
    $comment.append($nameWrap);
    $nameWrap.append($name);
    $comment.append($textWrap);
    $comment.append($image)
    $textWrap.append($text);
    $(document.body).prepend($comment)
    $comment.css({
        transform: 'scale(0)',
        opacity: 0
    })
    $comment.animate({
        opacity: 1
    }, {
        duration: "fast",
        step: function(now) {
            $(this).css({
                transform: `scale(${now})`
            })
        }
    });
    if(url = message.match(/https?:\/\/[\w/:%#\$&\?\(\)~\.=\+\-]+/,message)){
        url = url[0];
        var $a = $('<a></a>',{href:'#'});
        $a.click(e=>{
            shell.openExternal(url);
        })
        $text.wrap($a)
        readMessage = 'URLでございます'
    }
    !noread && talkText(readMessage)
}
Menu.setApplicationMenu(Menu.buildFromTemplate(menu = [{
    label: "接続",
    click() {
        prompt({
            title: '放送URLの入力',
            label: 'URL:',
            value: '',
            inputAttrs: { // attrs to be set if using 'input'
                type: 'url'
            },
            type: 'input' // 'select' or 'input, defaults to 'input'
        }).then((r) => {
            var lv = r.match(/(co|lv)\d+/);
            if (lv != null) {
                liveid = lv[0];
                nanasiindex = 1;
                Connect(lv[0])
            }
            loadFirst = false
        }).catch(console.error);
    }
}, {
    label: "開発者ツール",
    click() {
        remote.getCurrentWindow().toggleDevTools();
    }
}, {
    label: "表示",
    submenu: [{
        label: "拡大",
        role: "zoomin"
    }, {
        label: "縮小",
        role: "zoomout"
    }, {
        label: "拡大リセット",
        role: "resetzoom"
    }]
}, {
    label: "設定",
    submenu: [{
        label: "棒読みちゃん連携",
        type: "checkbox",
        checked: true,
        click() {
            this.checked = !this.checked
            if (this.checked) {
                tcpConnect();
            } else {
                tcpDisconnect();
            }
        }
    }, {
        label: "TCP接続設定",
        click() {
            prompt({
                title: 'TCP接続設定',
                label: 'デフォルト:127.0.0.1:50001',
                value: tcpTarget,
                type: 'input' // 'select' or 'input, defaults to 'input'
            }).then((r) => {
                if (!r) {
                    return
                }
                localStorage.tcpTarget = tcpTarget = r;
                if (menu[3].submenu[0].checked) {
                    tcpConnect();
                } else {
                    tcpDisconnect();
                }
            }).catch(console.error);
        }
    }]
}]))
tcpConnect();

class LiveInfomation {
    constructor(lvId) {
        this.lvId = lvId;
        this.title = "No Initialized";
        this.socket = null;
        this.userId = "anonymous-user";
        this.mode = 'stop';
    }
    async initialize() {
        this.rawData = await fetch('https://live2.nicovideo.jp/watch/' + this.lvId);
        this.rawData = await this.rawData.text();
        this.propData = $(this.rawData).filter("#embedded-data").data('props')
        this.title = this.propData.program.title;
        this.audienceToken = this.propData.player.audienceToken;
        this.broadcastId = this.propData.program.broadcastId;
        this.webSocketUrl = this.propData.site.relive.webSocketUrl;
        this.socket = await this.connectSocket(this.webSocketUrl);
        this.mode = 'joinRoom';
        // getpermitを送る
        var ret = await this.SendMessage({
            type: 'watch',
            body: {
                command: 'getpermit',
                requirement: {
                    broadcastId: this.broadcastId,
                    route: "",
                    stream: {
                        protocol: 'hls',
                        requireNewStream: true,
                        priorStreamQuality: 'low',
                        isLowLatency: true
                    },
                    room: {
                        isCommentable: true,
                        protocol: "webSocket"
                    }
                }
            }
        });
    }
    async SendMessage(data) {
        if (!this.socket) throw 'No Connected Socket';
        this.socket.send(JSON.stringify(data));
    }
    async messageEventHandler(data) {
        switch(this.mode){
            case 'joinRoom':
                const { body, type } = data;
                const { command } = body;
                switch (command) {
                case 'currentroom':
                    this.socket.close();
                    this.threadId = body.room.threadId
                    this.messageServerUri = body.room.messageServerUri;
                    console.log(`Change Socket`);
                    this.socket = await this.connectSocket(this.messageServerUri);
                    this.sendGetThread();
                    this.mode = 'chatConnected';
                    removeChat();
                }
                break;
            case 'chatConnected':
                if('chat' in data){
                    var noRead = data.chat.date <= this.lastThread || !this.lastThread;
                    setChat(data.chat.content,data.chat.user_id,noRead);
                }
                if('thread' in data){
                    this.lastThread = data.thread.server_time;
                }
        }
    }
    disconnect(){
        this.mode = 'disconnected';
        this.socket.close();
    }
    sendGetThread() {
        var data = [{
            "ping": {
                "content": "rs:0"
            }
        }, {
            "ping": {
                "content": "ps:0"
            }
        }, {
            "thread": {
                "thread": this.threadId,
                "version": "20061206",
                "fork": 0,
                "user_id": "guest",
                "res_from": -1000,
                "with_global": 1,
                "scores": 1,
                "nicoru": 0
            }
        }, {
            "ping": {
                "content": "pf:0"
            }
        }, {
            "ping": {
                "content": "rf:0"
            }
        }]
        return this.SendMessage(data);
    }
    connectSocket(url) {
        return new Promise((resolve, reject) => {
            var socket = new WebSocket(url, ['msg.nicovideo.jp#json']);
            socket.addEventListener('message', ({ data }) => {
                data = JSON.parse(data);
                this.messageEventHandler(data);
            })
            socket.addEventListener('open', () => {
                console.log('Socket Connected')
                resolve(socket)
            })
            socket.addEventListener('close', () => {
                console.log('Socket Closed');
            })
        })
    }
}

async function Connect(url) {
    if(liveInfomation)liveInfomation.disconnect();
    liveInfomation = new LiveInfomation(url);
    await liveInfomation.initialize();
}

function removeChat(){
    $('.comment').remove()
}
async function setChat(message,id,noRead){
    var noread =  noRead;
    //コテハンの設定

    if(/^\//.test(message)) return;
    if (/(＠|@|by)/.test(message)) {
        var name = message.split(message.match(/(＠|@|by)/g).slice(-1)[0]).slice(-1)[0];
        handleNames[id] = name;
        localStorage.handleNames = JSON.stringify(handleNames)
        appendComment({
            message,
            name,
            id
        }, noread)
        return
    }
    if (id in handleNames) {
        name = handleNames[id];
        return appendComment({
            message,
            name,
            id
        }, noread)
    }
    if (!isNaN(id)) {
        //生IDが取得できる場合
        var data = await fetch(`http://seiga.nicovideo.jp/api/user/info?id=${id}`);
        data = await data.text();
        name = ($(data).find('nickname').text());
        handleNames[id] = name;
        localStorage.handleNames = JSON.stringify(handleNames)
        return appendComment({
            message,
            name,
            id
        }, noread)
    } else {
        var idx = Math.floor(Math.random() * noImageTable.length);
        noImageTable[idx].count++
        name = noImageTable[idx].name + noImageTable[idx].count;
        noImageList[id] = noImageTable[idx].image
        handleNames[id] = name;
        localStorage.handleNames = JSON.stringify(handleNames)
        appendComment({
            message,
            name,
            id
        }, noread)
    }
}

function tcpConnect() {
    tcpSocket = true
}

function tcpDisconnect() {
    tcpSocket = null;
}

function talkText(message) {
    if (!tcpSocket) {
        return
    }
    if (message[0] == '/') return
    var arr = tcpTarget.split(':')
    var messageBuffer = new Buffer(message);
    var buffer = new Buffer(15 + messageBuffer.length);
    buffer.writeUInt16LE(0x0001, 0);
    buffer.writeUInt16LE(0xFFFF, 2);
    buffer.writeUInt16LE(0xFFFF, 4);
    buffer.writeUInt16LE(0xFFFF, 6);
    buffer.writeUInt16LE(0000, 8);
    buffer.writeUInt8(00, 10);
    buffer.writeUInt32LE(messageBuffer.length, 11);
    messageBuffer.copy(buffer, 15, 0, messageBuffer.length);
    var net = Net.connect({ port: arr[1], host: arr[0] })
    net.on('error', console.error)
    net.end(buffer);
}