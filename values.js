const ADT = Symbol("ADT");
function mkADT(name, ...argNames) {
  return function (obj) {
    for (const argName of argNames) {
      if (obj[argName] === undefined) {
        throw new Error(`Missing argument ${argName} for ${name}`);
      }
    }
    obj[ADT] = name;
    obj.match = (opts) => {
      if (opts[name]) return opts[name](obj);
      if (opts._) return opts._(obj);
      throw new Error(`No match found for ${name}`);
    };
    obj.toString = () => {
      const args = argNames.map((arg) => `${arg}: ${obj[arg]}`);
      return `${name}(${args.join(", ")})`;
    };
    return obj;
  };
}

// values
const Num = mkADT("Num", "value");
const Bool = mkADT("Bool", "value");
const Nil = mkADT("Nil");

const num = (value) => Num({ value });

class Env {
  constructor() {
    this.variables = new Map();
  }

  set(name, value) {
    this.variables.set(name, value);
  }

  get(name) {
    if (!this.variables.has(name)) {
      throw new Error(`Variable ${name} is not defined`);
    }
    return this.variables.get(name);
  }
}
