"""
Health check HTTP server for NLB/ECS health probes.
Listens on port 8687. Returns 200 if hashserv on port 8686 is responsive, 503 otherwise.
Event-driven: blocks on accept, zero CPU when idle.
"""

import socket
from http.server import HTTPServer, BaseHTTPRequestHandler

HASHSERV_PORT = 8686
HEALTH_PORT = 8687


def check_hashserv():
    """Verify hashserv is responsive by opening a TCP connection."""
    try:
        s = socket.create_connection(("127.0.0.1", HASHSERV_PORT), timeout=2)
        s.close()
        return True
    except Exception:
        return False


class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if check_hashserv():
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
        else:
            self.send_response(503)
            self.end_headers()
            self.wfile.write(b"hashserv unavailable")

    def log_message(self, *args):
        pass  # suppress access logs


if __name__ == "__main__":
    HTTPServer(("0.0.0.0", HEALTH_PORT), HealthHandler).serve_forever()
