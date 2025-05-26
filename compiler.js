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
    this.consts = []; // constants
    this.code = []; // instructions
    this.locals = []; // names of locals
    this.tempCount = 0; // temporary variable in use
    this.maxTemp = 0; // maximum number of temporary variables
    this.stack = []; // stack for return values
    this.lhs = null;
  }
  pushLocal(name) {
    const l = this.locals.length;
    this.locals.push(name);
    return l;
  }
  pushConst(value) {
    const l = this.consts.length;
    this.consts.push(value);
    return -l - 1;
  }
  withTemp(fn) {
    this.tempCount++;
    if (this.tempCount > this.maxTemp) this.maxTemp = this.tempCount;
    fn({ type: "temp", index: this.tempCount - 1 });
    this.tempCount--;
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
  mkFrame() {
    const size = this.locals.length + this.maxTemp;
    const code = this.code.map(({ instr, args }) =>
      instr(
        ...args.map((x) => {
          if (x.type === "temp") return x.index + this.locals.length;
          if (x.type === "local") return x.index;
          if (x.type === "const") return x.value;
          throw new Error(`Unknown type ${x.type} in instruction arguments`);
        })
      )
    );
    return new FnFrame(0, 0, size, this.consts, this.locals, code);
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
  gen.stack.push({ type: "const", value: c });
});

const add = mkNode("add", (lhs, rhs) => (gen) => {
  lhs.do(gen);
  const l = gen.stack.pop();
  gen.withTemp((t) => {
    gen.withLHS(t, () => rhs.do(gen));
    const r = gen.stack.pop();
    gen.emit(iADD, gen.lhs, l, r);
    gen.stack.push(gen.lhs);
  });
  // gen.emit(iADD, gen.lhs, t, gen.lhs);
});

const leti = mkNode(
  "let",
  (name, value) => (gen) => {
    for (let i = 0; i < gen.locals.length; i++) {
      if (gen.locals[i] === name)
        throw new Error(`Variable ${name} is already defined`);
    }
    const i = gen.pushLocal(name);
    const l = { type: "local", index: i };
    gen.withLHS(l, () => {
      value.do(gen);
      const v = gen.stack.pop();
      if (v.type === "const") gen.emit(iLOADK, i, v);
      else if (v.type !== "local" || v.index !== l.index) gen.emit(iMOVE, i, v);
      gen.stack.push(l);
    });
  },
  (name, value) => `let ${name} = ${value}`
);

const vari = mkNode(
  "var",
  (name) => (gen) => {
    for (let i = 0; i < gen.locals.length; i++) {
      if (gen.locals[i] !== name) continue;
      gen.stack.push({ type: "local", index: i });
      return;
    }
    throw new Error(`Variable ${name} is not defined`);
  },
  (name) => name
);

const set = mkNode(
  "set",
  (name, value) => (gen) => {
    for (let i = 0; i < gen.locals.length; i++) {
      if (gen.locals[i] !== name) continue;
      const l = { type: "local", index: i };
      gen.withLHS(l, () => {
        value.do(gen);
        const v = gen.stack.pop();
        if (v.type === "const") gen.emit(iLOADK, i, v);
        else if (v.type !== "local" || v.index !== l.index)
          gen.emit(iMOVE, i, v);
        gen.stack.push(l);
      });
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
      expr.do(gen);
      result = gen.stack.pop();
    }
    gen.stack.push(result);
  },
  (body) => `{ ${body.join("; ")} }`
);

function compile(node) {
  const gen = new CodeGen();
  node.do(gen);
  return gen.mkFrame();
}

const testFn = block([
  leti("a", add(con(num(2)), con(num(2)))),
  leti("b", add(con(num(3)), vari("a"))),
  set("a", add(vari("a"), vari("b"))),
]);
const vm = new VM(compile(testFn));
console.log(vm);
