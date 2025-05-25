/// Virtual Machine
// A simple register-based virtual machine that stores instructions as closures.
class VM {
  constructor(fn, regs, stack = [], pc = 0) {
    this.fn = fn;
    this.regs = Array(fn.size).fill(null);
    this.stack = stack;
    this.pc = pc;
    this.regOffset = 0;
  }
  /// local variables
  testRegIndex(i) {
    if (i < 0 || i >= this.fn.size)
      throw new Error(`Invalid register index ${i}`);
  }
  testConstIndex(i) {
    const j = -i - 1;
    if (j < 0 || j >= this.fn.consts.length)
      throw new Error(`Invalid constant index ${i}`);
  }
  getLocal(i) {
    this.testRegIndex(i);
    return this.regs[i];
  }
  setLocal(i, value) {
    this.testRegIndex(i);
    this.regs[i] = value;
  }
  getConst(i) {
    this.testConstIndex(i);
    return this.fn.consts[-i - 1];
  }
  getVal(i) {
    if (i < 0) return this.getConst(i);
    else return this.getLocal(i);
  }

  /// stepping
  step() {
    const instr = this.fn.getInstr(this.pc);
    if (instr === null) return false;
    instr.do(this);
    return true;
  }
}

class FnFrame {
  constructor(in_count, out_count, size, consts, locals, code) {
    this.in_count = in_count;
    this.out_count = out_count;
    this.size = size;
    this.consts = consts;
    this.locals = locals;
    this.code = code;
  }
  getInstr(pc) {
    if (pc >= this.code.length) return null;
    return this.code[pc];
  }
}

function checkNum(x) {
  return x.match({
    Num: (x) => x,
    _: () => {
      throw new Error("Expected a number");
    },
  });
}

/// Instructions
/**
 * Creates an instruction.
 * @param {string} name - The name of the instruction.
 * @param {function(...*): function(VM): void} gen - A generator function that returns the instruction's implementation.
 * @returns {function(...*): {name: string, do: function(VM): void}} A function that returns an instruction object.
 */
function mkInstr(name, gen) {
  return (...args) => ({
    name,
    do: gen(...args),
    toString: () => `${name} ${args.join(", ")}`,
  });
}
const iMOVE = mkInstr("MOVE", (a, b) => (vm) => {
  vm.setLocal(a, vm.getVal(b));
  vm.pc++;
});
const iLOADK = mkInstr("LOADK", (a, k) => (vm) => {
  vm.setLocal(a, vm.getConst(k));
  vm.pc++;
});
const iADD = mkInstr("ADD", (a, b, c) => (vm) => {
  const vb = vm.getVal(b);
  const vc = vm.getVal(c);
  checkNum(vb);
  checkNum(vc);
  vm.setLocal(a, num(vb.value + vc.value));
  vm.pc++;
});

/// Code generator

class CodeGen {
  constructor() {
    this.consts = [];
    this.code = [];
    this.names = [];
    this.locals = [];
    this.temps = [];
    this.lhs = null;
  }
  pushLocal(name) {
    const l = this.names.length;
    this.names.push(name);
    this.locals.push(l);
    return l;
  }
  pushTemp() {
    const l = this.names.length;
    this.names.push(`temp${l}`);
    this.temps.push(l);
    return l;
  }
  pushConst(value) {
    const l = this.consts.length;
    this.consts.push(value);
    return -l - 1;
  }
  withLHS(i, fn) {
    const old = this.lhs;
    this.lhs = i;
    const value = fn();
    this.lhs = old;
    return value;
  }
  emit(instr, ...args) {
    this.code.push({ instr, args });
  }
  getRegMap() {
    const regMap = Array(this.names.length);
    for (let i = 0; i < this.locals.length; i++) regMap[this.locals[i]] = i;
    for (let i = 0; i < this.temps.length; i++)
      regMap[this.temps[i]] = this.locals.length + i;
    return regMap;
  }
  getLocals() {
    return this.locals.map((i) => this.names[i]);
  }
  getCode() {
    const regMap = this.getRegMap();
    return this.code.map(({ instr, args }) =>
      instr(...args.map((i) => (i < 0 ? i : regMap[i])))
    );
  }
}
/**
 * Creates an AST node.
 * @param {string} name - The name of the node.
 * @param {function(...*): function(CodeGen): void} gen - A generator function that returns the node's code generation.
 * @param {function(...*): string} toString - A function that returns the string representation of the node.
 * @returns {function(...*): {name: string, do: function(CodeGen): void, toString: () => string}} A function that returns an instruction object.
 */
function mkNode(name, gen, toString) {
  return (...args) => ({
    name,
    do: gen(...args),
    toString: () => toString(...args),
  });
}

const con = mkNode("const", (value) => (gen) => {
  const c = gen.pushConst(value);
  gen.emit(iLOADK, gen.lhs, c);
});

const add = mkNode("add", (lhs, rhs) => (gen) => {
  const t = gen.pushTemp();
  gen.withLHS(t, () => lhs.do(gen));
  rhs.do(gen);
  gen.emit(iADD, gen.lhs, t, gen.lhs);
});

const leti = mkNode(
  "let",
  (name) => (gen) => {
    for (let i = 0; i < gen.names.length; i++) {
      if (gen.names[i] === name)
        throw new Error(`Variable ${name} is already defined`);
    }
    gen.pushLocal(name);
  },
  (name, value) => `let ${name} = ${value}`
);

const vari = mkNode(
  "var",
  (name) => (gen) => {
    for (let i = 0; i < gen.names.length; i++) {
      if (gen.names[i] !== name) continue;
      if (gen.lhs !== i) gen.emit(iMOVE, gen.lhs, i);
      return;
    }
    throw new Error(`Variable ${name} is not defined`);
  },
  (name) => name
);

const set = mkNode(
  "set",
  (name, value) => (gen) => {
    for (let i = 0; i < gen.names.length; i++) {
      if (gen.names[i] !== name) continue;
      gen.withLHS(i, () => value.do(gen));
      return;
    }
    throw new Error(`Variable ${name} is not defined`);
  },
  (name, value) => `${name} = ${value}`
);

const block = mkNode(
  "block",
  (body) => (gen) => {
    if (body.length === 0) throw new Error("Empty block");
    let result = null;
    for (const expr of body) {
      result = expr.do(gen);
    }
    return result;
  },
  (body) => `{ ${body.join("; ")} }`
);

function compile(node) {
  const gen = new CodeGen();
  node.do(gen);
  const fn = new FnFrame(
    0,
    0,
    gen.names.length,
    gen.consts,
    gen.getLocals(),
    gen.getCode()
  );
  return fn;
}

const testFn = block([
  leti("a"),
  set("a", add(con(num(2)), con(num(2)))),
  leti("b"),
  set("b", add(con(num(3)), vari("a"))),
  set("a", add(vari("a"), vari("b"))),
]);
const vm = new VM(compile(testFn));
console.log(vm);
