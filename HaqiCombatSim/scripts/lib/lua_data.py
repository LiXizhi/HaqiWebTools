"""Restricted Lua literal reader. Never executes Lua. Adapted from HaqiCombatEmulator."""
import re
LITERAL = re.compile(r'(true|false|nil)|(-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)')

class LuaData:
    def __init__(self, text):
        self.text, self.pos = text, 0

    def skip(self):
        while self.pos < len(self.text):
            if self.text[self.pos].isspace():
                self.pos += 1
            elif self.text.startswith('--', self.pos):
                end = self.text.find('\n', self.pos)
                self.pos = len(self.text) if end < 0 else end + 1
            else:
                break

    def value(self):
        self.skip()
        c = self.text[self.pos]
        self.pos += 1
        if c == '{':
            values = []
            while True:
                self.skip()
                if self.text[self.pos] == '}':
                    self.pos += 1
                    return values
                values.append(self.value())
                self.skip()
                if self.text[self.pos] in ',;':
                    self.pos += 1
                elif self.text[self.pos] != '}':
                    raise ValueError(f'Expected data delimiter at {self.pos}')
        if c in '\"\'':
            out = []
            while self.pos < len(self.text):
                ch = self.text[self.pos]
                self.pos += 1
                if ch == c:
                    return ''.join(out)
                if ch == '\\':
                    ch = self.text[self.pos]
                    self.pos += 1
                    if ch.isdigit():
                        digits = ch
                        while len(digits) < 3 and self.text[self.pos].isdigit():
                            digits += self.text[self.pos]
                            self.pos += 1
                        ch = chr(int(digits))
                    else:
                        ch = {'n': '\n', 'r': '\r', 't': '\t', 'a': '\a', 'b': '\b', 'v': '\v', 'f': '\f'}.get(ch, ch)
                out.append(ch)
            raise ValueError('Unterminated Lua string')
        self.pos -= 1
        match = LITERAL.match(self.text, self.pos)
        if not match:
            raise ValueError(f'Unsupported Lua data at {self.pos}')
        self.pos += len(match[0])
        if match[1]:
            return {'true': True, 'false': False, 'nil': None}[match[1]]
        return float(match[2]) if any(x in match[2] for x in '.eE') else int(match[2])
