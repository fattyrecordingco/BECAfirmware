"""Compile and exercise the actual native address validator using Foundation only."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
source = (root / 'apps/beca-apple/BECAApple/AppleSession.swift').read_text()
start = source.index('    private func validatedAddress()')
end = source.index('\n    private func get(', start)
validator = source[start:end].replace('private func validatedAddress()', 'func validatedAddress(_ address: String)').replace('private func failure(', 'func failure(')
tests = '''
for address in ["192.168.4.1", "10.0.0.2", "172.16.0.1", "172.31.255.254", "100.64.0.1", "100.65.132.146", "100.127.255.254", "beca-blk.local", " http://192.168.4.1/ "] {
    do { _ = try validatedAddress(address) } catch { fatalError("Rejected local address: \\(address)") }
}
for address in ["100.63.255.254", "100.128.0.1", "8.8.8.8", "172.32.0.1", "example.com", "https://192.168.4.1", "http://user:password@192.168.4.1", "http://192.168.4.1:81", "192.168.4.1/setup", "192.168.4.1?x=1", "192.168.4.1#x", "192.168..1", "192.168.4.256"] {
    do { _ = try validatedAddress(address); fatalError("Accepted invalid address: \\(address)") } catch {}
}
print("PASS: local address ranges, CGNAT boundaries, names and URL restrictions")
'''
with tempfile.TemporaryDirectory(prefix='beca-address-') as directory:
    program = Path(directory) / 'main.swift'
    program.write_text('import Foundation\n' + validator + tests)
    subprocess.run(['swift', str(program)], check=True)
