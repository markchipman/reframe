const PORT = 3218;
const socket = new WebSocket('ws://localhost:'+PORT);

socket.addEventListener('message', ev => {
    if( ev.data === 'RELOAD' ) {
        document.location.reload();
    }
});
