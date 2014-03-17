
var http = require('http');

/*
options:
 - port
 - hostname
 - backlog
 - timeout
 - endTimeout
 - catchErrors
*/

var HttpServer = module.exports = function HttpServer(options, requestListener, callback) {

    this._server = http.createServer();
    this._server
        .on('connection', this._connectionHandler.bind(this))
        .on('request', this._requestHandler.bind(this));

    if (callback) {
        this._server.on('listening', callback.bind(this, null));
        if (options.catchErrors)
            this._server.on('error', callback);
    }

    this._options = options;
    this._requestListener = requestListener;
    this._closing = false;
    this._sockets = [];

    this._server.listen(options.port, options.hostname, options.backlog)

};

HttpServer.prototype = {

    nativeServer: function() {
        return this._server;
    },

    _connectionHandler: function(socket) {

        if (this._closing)
            this.logger.warn('HTTP API accepted connection during shutdown');

        if (this._options.timeout)
            socket.setTimeout(this._options.timeout);

        // check if we know this connection
        if (!~this._sockets.indexOf(socket)) {

            // find first empty spot
            var pos = this._sockets.indexOf(null);
            if (~pos) {
                this._sockets[pos] = socket;

            } else {
                // or append it to the end of the list
                pos = this._sockets.push(socket) - 1;
            }

            // and wait till it closes
            socket.on('close', function() {
                this._sockets[pos] = null;
            }.bind(this));
        }
    },

    close: function(callback) {

        if (this._closing)
            return callback();

        this._closing = true;

        for (var i = 0; i < this._sockets.length; i++) {
            var socket = this._sockets[i];
            if (socket) this._closeSocket(socket);
        }
        this._sockets.length = 0;

        try {
            this._server.close(callback);
        }
        catch (error) {
            callback(error);
        }

    },

    _requestHandler: function(request, response) {

        this._processingStart(request.connection);

        var origResponseEnd = response.end,
            ref = this;

        response.end = function() {
            origResponseEnd.apply(this, arguments);
            ref._processingComplete(request.connection);
        };

        this._requestListener(request, response);

    },

    stats: function() {

        var sockets = {
            running: 0,
            waiting: 0
        };

        for (var i = 0; i < this._sockets.length; i++) {
            var socket = this._sockets[i];
            if (socket) {
                if (socket.__httpServer_processing)
                    sockets.running++;
                else
                    sockets.waiting++;
            }
        }

        return sockets;
    },

    _processingStart: function(socket) {
        socket.__httpServer_processing = true;
    },

    _processingComplete: function(socket) {
        socket.__httpServer_processing = false;
        if (this._closing) {
            this._closeSocket(socket);
        }
    },

    _closeSocket: function(socket) {
        if (!socket.__httpServer_processing) {
            socket.setTimeout(this._options.endTimeout || 300);
            socket.end();
        }
    }

};
