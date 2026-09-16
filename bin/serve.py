#!/usr/bin/env python3
"""Tiny static file server for the screensaver.

Prints `PORT=<n>` on stdout once bound, serves the project directory, and exits
when the page hits /__quit (which is how screensaver mode asks to be dismissed).
"""
import functools
import http.server
import os
import socketserver
import sys
import threading

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 0

DONE = threading.Event()


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0] == '/__quit':
            self.send_response(204)
            self.send_header('Content-Length', '0')
            self.end_headers()
            DONE.set()
            return
        super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    handler = functools.partial(Handler, directory=ROOT)
    with Server(('127.0.0.1', PORT), handler) as httpd:
        print('PORT=%d' % httpd.server_address[1], flush=True)
        threading.Thread(target=httpd.serve_forever, kwargs={'poll_interval': 0.2},
                         daemon=True).start()
        try:
            DONE.wait()
        except KeyboardInterrupt:
            pass
        httpd.shutdown()


if __name__ == '__main__':
    main()
