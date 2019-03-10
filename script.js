window.jQuery = window.$ = require('./jquery-3.3.1.min.js');
const prompt = require('electron-prompt');
// Electron
const {
    remote,
    ipcRenderer
} = require('electron');
const {
    app,
    Menu,
    BrowserWindow
} = remote;
const Net = require('net')
var handleNames = {}
if(localStorage.handleNames){
    handleNames = JSON.parse(localStorage.handleNames)
}
var nanasiindex = 0;
var tcpTarget = localStorage.tcpTarget || '127.0.0.1:50001'
var tcpSocket = null;
var loadFirst = true;
const baseURL = 'https://i-quiz-colopl-jp.akamaized.net/img/card/small/'
var noImageTable = [{
    name:"ゼルプスト(火闇) ",
    image:'N3zReM_card_12292_0.png',
    count:0
},{
    name:'メカガトリン ',
    image:'card_09857_0.png',
    count:0
},{
    name:'野良ナース ',
    image:'card_07261_0.png',
    count:0
},{
    name:'ウィズ? ',
    image:'WkFi5T_card_10308_0.png',
    count:0
}]
var noImageList = {};

function appendComment({
    text,
    name,
    userId
},noread) {
    var id = ""+userId
    var imageUrl = `http://usericon.nimg.jp/usericon/${id.slice(0,-4)}/${id}.jpg`
    var noImageUrl = noImageList[userId];
    if(!noImageUrl){
        noImageUrl = noImageTable[Math.floor(Math.random()*noImageTable.length)].image;
        noImageList[userId] = noImageUrl
    }
    var $comment = $('<div class="comment"/>');
    var $nameWrap = $('<div class="name-wrap"/>');
    var $name = $('<div class="name"/>');
    var $textWrap = $('<div class="text-wrap"/>');
    var $text = $('<div class="text"/>');
    var $image = $(`<img class="icon" src="${imageUrl}" onerror="this.src='${baseURL+noImageUrl}'">`)
    $name.text(name);
    $text.text(text);
    // if(/^(.*):(.*):(.+)$/.test(text)){
    //     var [base,tag,color,val] = text.match(/^(.*):(.*):(.+)$/);
    //     $text = $('<div class="text"/>');
    //     if(color){
    //         $text.css({color,'font-size':(tag||21.5)+'pt'});
    //     }
    //     $text.text(val)
    // }
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
    })
    !noread&&talkText(text)
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
                ipcRenderer.send('setlive', lv[0])
                nanasiindex = 1;
            }
            loadFirst = false
        }).catch(console.error);
    }
}, {
    label: "開発者ツール",
    click() {
        remote.getCurrentWindow().toggleDevTools();
    }
},{
    label:"表示",
    submenu:[{
        label:"拡大",
        role:"zoomin"
    },{
        label:"縮小",
        role:"zoomout"
    },{
        label:"拡大リセット",
        role:"resetzoom"
    }]
},{
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
                }else{
                    tcpDisconnect();
                }
            }).catch(console.error);
        }
    }]
}]))
tcpConnect();
ipcRenderer.on('title', function(event, message) {
    $('.comment').remove()
})
ipcRenderer.on('message', function(event, message,noread) {
    var $message = $(message).filter('chat');
    if ($message.length > 1) {
        var arg = arguments.callee;
        $message.each(function() {
            arg(event, $(this),!loadFirst);
        })
        loadFirst = true
        return
    }
    var userId = $message.attr('user_id');
    var text = $(message).text();
    if (!text) {
        return;
    }
    var name = null;
    if (/(＠|@|by)/.test(text)) {
        var name = text.split(text.match(/(＠|@|by)/g).slice(-1)[0]).slice(-1)[0];
        handleNames[userId] = name;
        localStorage.handleNames = JSON.stringify(handleNames)
        appendComment({
            text,
            name,
            userId
        },noread)
        return
    }
    if (userId in handleNames) {
        name = handleNames[userId];
        appendComment({
            text,
            name,
            userId
        },noread)
    } else {
        if (!isNaN(userId)) {
            //生IDが取得できる場合
            $.get(`http://seiga.nicovideo.jp/api/user/info?id=${userId}`, (data) => {
                name = ($(data).find('nickname').text());
                handleNames[userId] = name;
                localStorage.handleNames = JSON.stringify(handleNames)
                appendComment({
                    text,
                    name,
                userId
                },noread)
            })
        } else {
            var idx = Math.floor(Math.random()*noImageTable.length);
            noImageTable[idx].count++
            name = noImageTable[idx].name + noImageTable[idx].count;
            noImageList[userId] = noImageTable[idx].image
            handleNames[userId] = name;
            localStorage.handleNames = JSON.stringify(handleNames)
            appendComment({
                text,
                name,
                userId
            },noread)
            //184ついてる場合
        }
    }
})

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
    if(message[0] == '/') return
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
    Net.connect({port:arr[1], host:arr[0]}).end(buffer).on('error',console.error);

}