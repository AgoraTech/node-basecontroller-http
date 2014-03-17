
var os = require('os'),
    parseURL = require('url').parse,
    HttpServer = require('./http-server'),
    StreamBuffer = require('basecontroller-libs').StreamBuffer;

/*
options:
 - port
 - hostname
 - backlog
 - timeout
 - endTimeout
 - catchErrors

request callback: function(url, data, callback, request, response)
response callback: function(httpStatus, type, data, headers)

*/

var HttpSimpleServer = module.exports = function HttpSimpleServer(options, requestListener, callback) {
    HttpServer.call(this, options, this._simpleRequestProcessor.bind(this), callback);

    this._simpleRequestListener = requestListener;

};

HttpSimpleServer.prototype = {
    __proto__: HttpServer.prototype,

    _simpleRequestProcessor: function(request, response) {

        var streamBuffer = new StreamBuffer();
        request.on('end', this._simpleEndHandler.bind(this, request, response, streamBuffer));
        request.pipe(streamBuffer);

    },

    _simpleEndHandler: function(request, response, streamBuffer) {

        var rawPostData = streamBuffer.getBuffer().toString('utf-8'),
            postData = null;

        if (request.method == 'POST') {
            if (request.headers['content-type'] == 'application/x-www-form-urlencoded') {
                postData = parseURL('?' + rawPostData, true).query;

            } else if (request.headers['content-type'] == 'application/json') {
                try {
                    postData = JSON.parse(rawPostData);
                }
                catch (err) {
                    postData = false;
                }
                if (typeof postData != 'object') {
                    postData = false;
                }
            } else {
                postData = false;
            }
        }

        this._simpleRequestListener(request.url, postData,
            this._simpleResponseHandler.bind(this, request, response), request, response);

    },

    _simpleResponseHandler: function(request, response, httpStatus, type, data, headers) {

        if (!response.writable) return;

        var body = '';
        headers = headers || {};

        if (type == 'json') {
            body = JSON.stringify(data);
            headers['Content-Type'] = 'application/json; charset=utf-8';

        } else {
            body = data;
            headers['Content-Type'] = 'text/plain';
        }

        headers['Content-Length'] = body ? Buffer.byteLength(body, 'utf-8') : 0;
        headers['X-Handled-By'] = os.hostname();

        response.statusCode = httpStatus || 200;

        for (var header in headers)
            response.setHeader(header, headers[header]);

        response.end(body);

    }

};
