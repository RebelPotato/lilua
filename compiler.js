class VM {
  constructor(fn, regs, stack, pc) {
    this.fn = fn;
    this.regs = regs;
    this.stack = stack;
    this.pc = pc;
  }
  static init(fn) {
    return new VM(fn, [], [], 0);
  }
  mkReg() {
    const reg = this.regs.length;
    this.regs.push(null);
    return reg;
  }
  step() {
    const instr = this.fn.getInstr(this.pc);
    if (instr === null) return false;
    instr.do(this);
    return true;
  }
}

class FnFrame {
  constructor(in_count, out_count, consts, prog) {
    this.consts = consts;
    this.in_count = in_count;
    this.out_count = out_count;
    this.prog = prog;
  }
  getInstr(pc) {
    if (pc >= this.prog.length) return null;
    return this.prog[pc];
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
const iLOADK = mkInstr("LOADK", (a, k) => (vm) => {
  vm.regs[a] = vm.fn.consts[k];
  vm.pc++;
});
const iADD = mkInstr("ADD", (a, b, c) => (vm) => {
  const vb = vm.regs[b];
  const vc = vm.regs[c];
  checkNum(vb);
  checkNum(vc);
  vm.regs[a] = num(vb.value + vc.value);
  vm.pc++;
});

// create a function by hand
const testFn = new FnFrame(
  0,
  0,
  [num(2), num(3)],
  [
    iLOADK(0, 0), // a = 2
    iLOADK(1, 1), // b = 3
    iADD(1, 0, 1), // b = a + b
  ]
);
const vm = VM.init(testFn);
console.log(vm);
