function elBuilder(element, attrs, children) {
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "text") {
      element.innerText = value;
    } else if (key === "html") {
      element.innerHTML = value;
    } else if (key === "style") {
      for (const [styleKey, styleValue] of Object.entries(value)) {
        element.style[styleKey] = styleValue;
      }
    } else if (key === "class") {
      element.classList.add(...value.split(" "));
    } else if (key === "dataset") {
      for (const [dataKey, dataValue] of Object.entries(value)) {
        element.dataset[dataKey] = dataValue;
      }
    } else if (key.startsWith("on")) {
      const eventName = key.slice(2).toLowerCase();
      element.addEventListener(eventName, value);
    } else {
      element.setAttribute(key, value);
    }
  }
  children.forEach((child) => {
    if (child instanceof Node) {
      element.appendChild(child);
    } else {
      element.appendChild(document.createTextNode(child.toString()));
    }
  });
  return element;
}
const h = (tag, attrs = {}, children = []) =>
  elBuilder(document.createElement(tag), attrs, children);
function $(selector) {
  const el = document.querySelector(selector);
  if (!el) throw new Error("Element not found: " + selector);
  const obj = {
    el,
    on: el.addEventListener.bind(el),
    onDebounce: (event, delay, fn) => {
      let timeoutId = null;
      function debouncedFn(...args) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => ((timeoutId = null), fn(...args)), delay);
      }
      el.addEventListener(event, debouncedFn);
    },
  };
  return obj;
}

function render(vm) {
  $("#constants").el.innerHTML = "";
  $("#instructions").el.innerHTML = "";
  $("#registers").el.innerHTML = "";

  const constants = vm.fn.consts.map((c) =>
    h("div", { class: "constant" }, [c.toString()])
  );
  $("#constants").el.append(...constants);

  const instructions = vm.fn.code.map((instr, i) =>
    h("p", { class: "instruction" }, [i, instr.toString()])
  );
  $("#instructions").el.append(...instructions);

  const registers = vm.regs.map((r, i) =>
    h("div", { class: "register" }, [i, r ? r.value : "null"])
  );
  $("#registers").el.append(...registers);
}
$("#step").on("click", () => {
  vm.step();
  render(vm);
})
render(vm);