// packages/simulation/src/version.ts
var SIMULATION_VERSION = "0.1.1";
var OPERATIONS_SCHEMA_VERSION = "layoutlab.operations/1";
var OPERATIONS_ENGINE_VERSION = "layoutlab.operations-engine/1";
// node_modules/zod/v4/core/util.js
function getEnumValues(entries) {
	const numericValues = Object.values(entries).filter((v) => typeof v === "number");
	return Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
}
function joinValues(array, separator = "|") {
	return array.map((val) => stringifyPrimitive(val)).join(separator);
}
function jsonStringifyReplacer(_, value) {
	if (typeof value === "bigint") return value.toString();
	return value;
}
var Cached = class {
	constructor(getter) {
		this._getter = getter;
		this._value = void 0;
	}
	get value() {
		const getter = this._getter;
		if (getter !== void 0) {
			this._value = getter();
			this._getter = void 0;
		}
		return this._value;
	}
};
function cached(getter) {
	return new Cached(getter);
}
function nullish(input) {
	return input === null || input === void 0;
}
function cleanRegex(source) {
	const start = source.startsWith("^") ? 1 : 0;
	const end = source.endsWith("$") ? source.length - 1 : source.length;
	return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
	const ratio = val / step;
	const roundedRatio = Math.round(ratio);
	const tolerance = 4 * Number.EPSILON * Math.max(Math.abs(ratio), 1);
	if (Math.abs(ratio - roundedRatio) < tolerance) return 0;
	return ratio - roundedRatio;
}
function assignProp(target, prop, value) {
	Object.defineProperty(target, prop, {
		value,
		writable: true,
		enumerable: true,
		configurable: true
	});
}
/**
* Whichever object a def's `shape` currently answers from: the one the caller passed until the first read, the frozen copy after it.
*
* Its keys and descriptors read without invoking anything, which is what lets a discriminated union check its discriminator, and the cycle walk read a shape, without resolving a getter that references the schema being constructed. A def that answers `shape` from an accessor of its own has none.
*/
function rawShape(def) {
	const desc = Object.getOwnPropertyDescriptor(def, "shape");
	return desc?.get ? desc.get.raw : desc?.value;
}
function sourceShape(schema) {
	return rawShape(schema._zod.def) ?? schema._zod.def.shape;
}
function deferProp(target, key, getter) {
	Object.defineProperty(target, key, {
		get() {
			const value = getter();
			assignProp(this, key, value);
			return value;
		},
		enumerable: true,
		configurable: true
	});
}
function putProp(target, key, value) {
	if (key in target) assignProp(target, key, value);
	else target[key] = value;
}
/**
* Copies `keys` of `source`'s shape onto `target`, each value passed through `wrap`.
*
* A key the source has resolved is copied through now, so the derived shape states it outright and nothing has to resolve it to learn what it holds. A key the source still defers stays deferred, and reads back through the source's own `shape`, so it resolves once and both shapes get that one schema.
*/
function mirrorShape(target, source, keys, wrap) {
	const raw = sourceShape(source);
	for (const key of keys) {
		const desc = Object.getOwnPropertyDescriptor(raw, key);
		if (!desc.enumerable) continue;
		if (desc.get) deferProp(target, key, () => {
			const value = source._zod.def.shape[key];
			return wrap ? wrap(value, key) : value;
		});
		else putProp(target, key, wrap ? wrap(desc.value, key) : desc.value);
	}
}
function mirrorProps(target, source) {
	for (const key of Reflect.ownKeys(source)) {
		const desc = Object.getOwnPropertyDescriptor(source, key);
		if (!desc.enumerable) continue;
		if (desc.get) deferProp(target, key, () => source[key]);
		else putProp(target, key, desc.value);
	}
}
function mergeDefs(...defs) {
	const mergedDescriptors = {};
	for (const def of defs) {
		const descriptors = Object.getOwnPropertyDescriptors(def);
		Object.assign(mergedDescriptors, descriptors);
	}
	return Object.defineProperties({}, mergedDescriptors);
}
function esc(str) {
	return JSON.stringify(str);
}
function slugify(input) {
	return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
var captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
function isObject(data) {
	return typeof data === "object" && data !== null && !Array.isArray(data);
}
var allowsEval = /* @__PURE__*/ cached(() => {
	if (globalConfig.jitless) return false;
	if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) return false;
	try {
		new Function("");
		return true;
	} catch (_) {
		return false;
	}
});
function isPlainObject(o) {
	if (isObject(o) === false) return false;
	const ctor = o.constructor;
	if (ctor === void 0) return true;
	if (typeof ctor !== "function") return true;
	const prot = ctor.prototype;
	if (isObject(prot) === false) return false;
	if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) return false;
	return true;
}
function shallowClone(o) {
	if (isPlainObject(o)) return { ...o };
	if (Array.isArray(o)) return [...o];
	if (o instanceof Map) return new Map(o);
	if (o instanceof Set) return new Set(o);
	return o;
}
var propertyKeyTypes = /* @__PURE__*/ new Set([
	"string",
	"number",
	"symbol"
]);
function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
	const cl = new inst._zod.constr(def ?? inst._zod.def);
	if (!def || params?.parent) cl._zod.parent = inst;
	return cl;
}
function normalizeParams(_params) {
	const params = _params;
	if (!params) return {};
	if (typeof params === "string") return { error: () => params };
	if (params?.message !== void 0) {
		if (params?.error !== void 0) throw new Error("Cannot specify both `message` and `error` params");
		params.error = params.message;
	}
	delete params.message;
	if (typeof params.error === "string") return {
		...params,
		error: () => params.error
	};
	return params;
}
function stringifyPrimitive(value) {
	if (typeof value === "bigint") return value.toString() + "n";
	if (typeof value === "string") return `"${value}"`;
	return `${value}`;
}
function optionalKeys(shape) {
	return Object.keys(shape).filter((k) => {
		return shape[k]._zod.optin !== void 0 && shape[k]._zod.optout === "optional";
	});
}
var NUMBER_FORMAT_RANGES = /*@__PURE__*/ (() => ({
	safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
	int32: [-2147483648, 2147483647],
	uint32: [0, 4294967295],
	float32: [-34028234663852886e22, 34028234663852886e22],
	float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
}))();
var BIGINT_FORMAT_RANGES = {
	int64: [/* @__PURE__*/ BigInt("-9223372036854775808"), /* @__PURE__*/ BigInt("9223372036854775807")],
	uint64: [/* @__PURE__*/ BigInt(0), /* @__PURE__*/ BigInt("18446744073709551615")]
};
function pick(schema, mask) {
	const currDef = schema._zod.def;
	const checks = currDef.checks;
	if (checks && checks.length > 0) throw new Error(".pick() cannot be used on object schemas containing refinements");
	const newShape = {};
	mirrorShape(newShape, schema, maskedKeys(schema, mask));
	return clone(schema, mergeDefs(currDef, {
		shape: newShape,
		checks: []
	}));
}
function maskedKeys(schema, mask) {
	const raw = sourceShape(schema);
	const keys = [];
	for (const key of Reflect.ownKeys(mask)) {
		if (!Object.getOwnPropertyDescriptor(raw, key)?.enumerable) throw new Error(`Unrecognized key: "${String(key)}"`);
		if (mask[key]) keys.push(key);
	}
	return keys;
}
function omit(schema, mask) {
	const currDef = schema._zod.def;
	const checks = currDef.checks;
	if (checks && checks.length > 0) throw new Error(".omit() cannot be used on object schemas containing refinements");
	const omitted = new Set(maskedKeys(schema, mask));
	const newShape = {};
	mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)).filter((key) => !omitted.has(key)));
	return clone(schema, mergeDefs(currDef, {
		shape: newShape,
		checks: []
	}));
}
function extend(schema, shape) {
	if (!isPlainObject(shape)) throw new Error("Invalid input to extend: expected a plain object");
	const checks = schema._zod.def.checks;
	if (checks && checks.length > 0) {
		const existingShape = sourceShape(schema);
		for (const key of Reflect.ownKeys(shape)) if (Object.getOwnPropertyDescriptor(existingShape, key) !== void 0) throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
	}
	return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
}
function extended(schema, shape) {
	const newShape = {};
	mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)));
	mirrorProps(newShape, shape);
	return newShape;
}
function safeExtend(schema, shape) {
	if (!isPlainObject(shape)) throw new Error("Invalid input to safeExtend: expected a plain object");
	return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
}
function merge(a, b) {
	if (!b?._zod?.def) throw new Error("Invalid input to merge: expected an object schema. To merge a plain shape, use `.extend()`.");
	if (a._zod.def.checks?.length) throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
	const newShape = {};
	mirrorShape(newShape, a, Reflect.ownKeys(sourceShape(a)));
	mirrorShape(newShape, b, Reflect.ownKeys(sourceShape(b)));
	return clone(a, mergeDefs(a._zod.def, {
		shape: newShape,
		get catchall() {
			return b._zod.def.catchall;
		},
		checks: b._zod.def.checks ?? []
	}));
}
function partial(Class, schema, mask, name = "partial") {
	const checks = schema._zod.def.checks;
	if (checks && checks.length > 0) throw new Error(`.${name}() cannot be used on object schemas containing refinements`);
	const selected = mask ? new Set(maskedKeys(schema, mask)) : void 0;
	const newShape = {};
	mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), Class && ((value, key) => selected && !selected.has(key) ? value : new Class({
		type: "optional",
		innerType: value
	})));
	return clone(schema, mergeDefs(schema._zod.def, {
		shape: newShape,
		checks: []
	}));
}
function required(Class, schema, mask) {
	const selected = mask ? new Set(maskedKeys(schema, mask)) : void 0;
	const newShape = {};
	mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), (value, key) => selected && !selected.has(key) ? value : new Class({
		type: "nonoptional",
		innerType: value
	}));
	return clone(schema, mergeDefs(schema._zod.def, { shape: newShape }));
}
function aborted(x, startIndex = 0) {
	if (x.aborted === true) return true;
	for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue !== true) return true;
	return false;
}
function explicitlyAborted(x, startIndex = 0) {
	if (x.aborted === true) return true;
	for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue === false) return true;
	return false;
}
function prefixIssues(path, issues) {
	return issues.map((iss) => {
		var _a;
		(_a = iss).path ?? (_a.path = []);
		iss.path.unshift(path);
		return iss;
	});
}
function unwrapMessage(message) {
	return typeof message === "string" ? message : message?.message;
}
/** The leading size checks of `defChecks` that set an upper bound, each paired with it. */
function sizeCaps(defChecks) {
	const caps = [];
	for (const ch of defChecks ?? []) {
		const d = ch._zod.def;
		if (!/_(length|size)$|_equals$/.test(d.check)) break;
		const max = d.maximum ?? d.length ?? d.size;
		if (max >= 0) caps.push([max, ch]);
	}
	return caps;
}
function attachSchema(issues, start, inst) {
	var _a;
	for (let i = start; i < issues.length; i++) (_a = issues[i]).schema ?? (_a.schema = inst);
}
function finalizeIssue(iss, ctx, config) {
	var _a;
	const traits = iss.inst?._zod?.traits;
	if (traits?.has("$ZodType")) {
		if (traits.has("$ZodCheck")) (_a = iss).schema ?? (_a.schema = iss.inst);
		else iss.schema = iss.inst;
	}
	const schemaError = iss.schema !== iss.inst ? iss.schema?._zod.def?.error : void 0;
	const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(schemaError?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
	const full = {};
	for (const k of Object.keys(iss)) {
		if (k === "inst" || k === "schema" || k === "continue" || k === "input" || k === "__proto__") continue;
		full[k] = iss[k];
	}
	full.path ?? (full.path = []);
	full.message = message;
	if (ctx?.reportInput) full.input = iss.input;
	return full;
}
var highSurrogate = /[\uD800-\uDBFF]/;
function codePointLength(str) {
	const units = str.length;
	if (!highSurrogate.test(str)) return units;
	let count = units;
	for (let i = 0; i < units - 1; i++) if ((str.charCodeAt(i) & 64512) === 55296 && (str.charCodeAt(i + 1) & 64512) === 56320) {
		count--;
		i++;
	}
	return count;
}
function getLengthableOrigin(input) {
	if (Array.isArray(input)) return "array";
	if (typeof input === "string") return "string";
	return "unknown";
}
function parsedType(data) {
	const t = typeof data;
	switch (t) {
		case "number": return Number.isNaN(data) ? "nan" : "number";
		case "object": {
			if (data === null) return "null";
			if (Array.isArray(data)) return "array";
			const obj = data;
			if (obj && Object.getPrototypeOf(obj) !== Object.prototype && "constructor" in obj && obj.constructor) return obj.constructor.name;
		}
	}
	return t;
}
function issue$1(...args) {
	const [iss, input, inst] = args;
	if (typeof iss === "string") return {
		message: iss,
		code: "custom",
		input,
		inst
	};
	return { ...iss };
}
/**
* Installs a trait's members on its prototype. Each value builds that member for the instance on first read; the built value shadows the accessor as an own property, so a detached `const { parse } = schema` keeps working.
*
* Call this from a `proto` initializer, which runs once per prototype — never per instance.
*/
function members(proto, table) {
	for (const key in table) {
		const desc = Object.getOwnPropertyDescriptor(table, key);
		if (desc.get) Object.defineProperty(proto, key, {
			...desc,
			enumerable: false
		});
		else defineBound(proto, key, desc.value);
	}
}
/** Shadows a prototype member with an own value, so a getter that builds from the instance runs once. */
function own(inst, key, value, enumerable = true) {
	Object.defineProperty(inst, key, {
		configurable: true,
		writable: true,
		enumerable,
		value
	});
	return value;
}
/** Like {@link own}, for a member that was never an own data property and has to stay out of `Object.keys`. */
function hide(inst, key, value) {
	return own(inst, key, value, false);
}
/** Adds members a table derives from the instance: each builds on first read and shadows as own data, and assignment shadows the same way, as when these were own properties. */
/* @__NO_SIDE_EFFECTS__ */
function derived(computes, table) {
	for (const key in computes) {
		const compute = computes[key];
		Object.defineProperty(table, key, {
			configurable: true,
			enumerable: true,
			get() {
				return own(this, key, compute(this));
			},
			set(value) {
				own(this, key, value);
			}
		});
	}
	return table;
}
function defineBound(proto, key, fn) {
	Object.defineProperty(proto, key, {
		configurable: true,
		get() {
			return this == null ? fn : own(this, key, fn.bind(this));
		},
		set(value) {
			own(this, key, value);
		}
	});
}
/** Returns the prototype to install on, or `undefined` if this group is already installed on it. */
function claim(inst, sentinel) {
	const proto = Object.getPrototypeOf(inst);
	return sentinel in proto ? void 0 : proto;
}
var installing;
var broke = false;
var breaker = {
	configurable: true,
	get() {
		broke = true;
	}
};
/**
* Installs a lazily-derived internal on the `_zod` prototype of `inst`'s
* constructor, computed from the internals object itself and cached there on
* first read. One accessor per constructor rather than one per instance.
*/
function defineLazyInternal(inst, key, compute) {
	const proto = Object.getPrototypeOf(inst._zod);
	if (key in proto && installing !== inst._zod) {
		installing = void 0;
		return;
	}
	installing = inst._zod;
	Object.defineProperty(proto, key, {
		configurable: true,
		get() {
			Object.defineProperty(this, key, breaker);
			const outer = broke;
			broke = false;
			try {
				const value = compute(this);
				if (broke) delete this[key];
				else Object.defineProperty(this, key, {
					configurable: true,
					writable: true,
					value
				});
				broke = broke || outer;
				return value;
			} catch (err) {
				delete this[key];
				broke = broke || outer;
				throw err;
			}
		},
		set(value) {
			Object.defineProperty(this, key, {
				configurable: true,
				writable: true,
				value
			});
		}
	});
}
/**
* Installs `key` on `inst`'s prototype, computed by `make` on first read and cached there as an own
* data property. One accessor per constructor rather than one per instance, because an own accessor
* puts every instance after the first into v8 dictionary mode. The key doubles as the sentinel.
*/
function installLazyProp(inst, key, make, enumerable) {
	const proto = claim(inst, key);
	if (!proto) return;
	Object.defineProperty(proto, key, {
		configurable: true,
		get() {
			const desc = {
				configurable: true,
				writable: true,
				enumerable,
				value: void 0
			};
			Object.defineProperty(this, key, desc);
			desc.value = make(this);
			Object.defineProperty(this, key, desc);
			return desc.value;
		},
		set(value) {
			Object.defineProperty(this, key, {
				configurable: true,
				writable: true,
				enumerable,
				value
			});
		}
	});
}
/** Marks the thunk `_catch` synthesises for a constant catch value. `Function.length` cannot tell that thunk from a user callback — rest and defaulted parameters both report arity 0 — and a user callback reads `ctx.error`, whose issues only finalize correctly against the caller's per-parse error map. Provenance can say what arity cannot. A plain string key rather than `Symbol.for`, whose call at module scope no bundler can prove pure — the same shape that anchored `urlCanParse` into every build. */
var CONSTANT_CATCH = "~constantCatch";
/** Wraps a constant catch value in a thunk tagged with {@link CONSTANT_CATCH}. */
function constantCatch(value) {
	const fn = () => value;
	fn[CONSTANT_CATCH] = true;
	return fn;
}
// node_modules/zod/v4/core/core.js
var _a$1;
var _zodDesc = {
	value: void 0,
	enumerable: false
};
var _E = "captureStackTrace" in Error ? Error : null;
function newError(Definition) {
	const E = _E;
	if (E) {
		const saved = E.stackTraceLimit;
		if (typeof saved === "number") {
			try {
				E.stackTraceLimit = 0;
			} catch {
				_E = null;
				return new Definition();
			}
			try {
				return new Definition();
			} finally {
				E.stackTraceLimit = saved;
			}
		}
	}
	return new Definition();
}
/* @__NO_SIDE_EFFECTS__ */
function $constructor(name, initializer, proto, params) {
	const zodProto = {};
	function Internals(def) {
		this.def = def;
		this.constr = _;
		this.traits = /* @__PURE__ */ new Set();
	}
	Internals.prototype = zodProto;
	const protoMembers = proto;
	const initialized = protoMembers && /* @__PURE__ */ new WeakSet();
	function init(inst, def) {
		if (!inst._zod) {
			_zodDesc.value = new Internals(def);
			try {
				Object.defineProperty(inst, "_zod", _zodDesc);
			} finally {
				_zodDesc.value = void 0;
			}
		} else if (inst._zod.traits.has(name)) return;
		inst._zod.traits.add(name);
		initializer(inst, def);
		if (initialized) {
			const own = Object.getPrototypeOf(inst);
			const ctorProto = inst._zod.constr.prototype;
			let up = own;
			while (up && up !== ctorProto) up = Object.getPrototypeOf(up);
			const target = up ?? own;
			if (!initialized.has(target)) {
				initialized.add(target);
				members(target, protoMembers);
			}
		}
		const proto = _.prototype;
		for (const k in proto) {
			if (!Object.prototype.hasOwnProperty.call(proto, k)) continue;
			if (!(k in inst)) inst[k] = proto[k].bind(inst);
		}
	}
	const Parent = params?.Parent ?? Object;
	class Definition extends Parent {}
	Object.defineProperty(Definition, "name", { value: name });
	function _(def) {
		const inst = params?.Parent ? newError(Definition) : this;
		init(inst, def);
		const deferred = inst._zod.deferred;
		if (deferred) {
			for (const fn of deferred) fn();
			inst._zod.deferred = void 0;
		}
		const pp = globalThis.__zod_globalConfig?.postProcessor;
		if (pp) pp(inst);
		return inst;
	}
	Object.defineProperty(_, "init", { value: init });
	Object.defineProperty(_, Symbol.hasInstance, { value: (inst) => {
		if (params?.Parent && inst instanceof params.Parent) return true;
		return inst?._zod?.traits?.has(name);
	} });
	Object.defineProperty(_, "name", { value: name });
	return _;
}
var $ZodAsyncError = class extends Error {
	constructor() {
		super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
	}
};
var $ZodEncodeError = class extends Error {
	constructor(name) {
		super(`Encountered unidirectional transform during encode: ${name}`);
		this.name = "ZodEncodeError";
	}
};
(_a$1 = globalThis).__zod_globalConfig ?? (_a$1.__zod_globalConfig = {});
var globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
	if (newConfig) Object.assign(globalConfig, newConfig);
	return globalConfig;
}
// node_modules/zod/v4/core/errors.js
function _getMessage() {
	const internals = this._zod;
	internals.message ?? (internals.message = JSON.stringify(internals.def, jsonStringifyReplacer, 2));
	return internals.message;
}
function _setMessage(value) {
	this._zod.message = value;
}
var _messageDesc = {
	get: _getMessage,
	set: _setMessage,
	enumerable: true,
	configurable: true
};
var _issuesDesc = {
	value: void 0,
	enumerable: false
};
var _installedToString = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
var initializer$1 = (inst, def) => {
	inst.name = "$ZodError";
	_issuesDesc.value = def;
	Object.defineProperty(inst, "issues", _issuesDesc);
	_issuesDesc.value = void 0;
	Object.defineProperty(inst, "message", _messageDesc);
	const proto = Object.getPrototypeOf(inst);
	if (!_installedToString.has(proto)) {
		_installedToString.add(proto);
		Object.defineProperty(proto, "toString", {
			configurable: true,
			enumerable: false,
			get() {
				const value = () => this.message;
				Object.defineProperty(this, "toString", {
					value,
					configurable: true,
					writable: true
				});
				return value;
			},
			set(value) {
				Object.defineProperty(this, "toString", {
					value,
					configurable: true,
					writable: true
				});
			}
		});
	}
};
var $ZodError = /* @__PURE__ */ $constructor("$ZodError", initializer$1);
/** Get-or-create `obj[key]` as an own data property. A path segment naming an inherited member
* ("toString", "constructor") would otherwise read through to the prototype, and assigning
* "__proto__" would hit the setter instead of creating a key. */
function node(obj, key, make) {
	if (!Object.prototype.hasOwnProperty.call(obj, key)) {
		if (key === "__proto__") Object.defineProperty(obj, key, {
			value: make(),
			writable: true,
			enumerable: true,
			configurable: true
		});
		else obj[key] = make();
	}
	return obj[key];
}
function flattenError(error, mapper = (issue) => issue.message) {
	const fieldErrors = {};
	const formErrors = [];
	for (const sub of error.issues) if (sub.path.length > 0) node(fieldErrors, sub.path[0], () => []).push(mapper(sub));
	else formErrors.push(mapper(sub));
	return {
		formErrors,
		fieldErrors
	};
}
function formatError(error, mapper = (issue) => issue.message) {
	const fieldErrors = { _errors: [] };
	const processError = (error, path = []) => {
		for (const issue of error.issues) if (issue.code === "invalid_union" && issue.errors.length) issue.errors.map((issues) => processError({ issues }, [...path, ...issue.path]));
		else if (issue.code === "invalid_key") processError({ issues: issue.issues }, [...path, ...issue.path]);
		else if (issue.code === "invalid_element") processError({ issues: issue.issues }, [...path, ...issue.path]);
		else {
			const fullpath = [...path, ...issue.path];
			if (fullpath.length === 0) fieldErrors._errors.push(mapper(issue));
			else {
				let curr = fieldErrors;
				let i = 0;
				while (i < fullpath.length) {
					const el = fullpath[i];
					const terminal = i === fullpath.length - 1;
					if (el === "_errors") {
						if (terminal) curr._errors.push(mapper(issue));
						i++;
						continue;
					}
					if (!Object.prototype.hasOwnProperty.call(curr, el)) Object.defineProperty(curr, el, {
						value: { _errors: [] },
						enumerable: true,
						writable: true,
						configurable: true
					});
					const node = curr[el];
					if (terminal) node._errors.push(mapper(issue));
					curr = node;
					i++;
				}
			}
		}
	};
	processError(error);
	return fieldErrors;
}
// node_modules/zod/v4/core/parse.js
function finalizeParams(callee, params) {
	return {
		callee: params?.callee ?? callee,
		Err: params?.Err
	};
}
var _parse = (_Err) => {
	const fn = (schema, value, _ctx, _params) => {
		const ctx = _ctx ? {
			..._ctx,
			async: false
		} : { async: false };
		const result = schema._zod.run({
			value,
			issues: []
		}, ctx);
		if (result instanceof Promise) throw new $ZodAsyncError();
		if (result.issues.length) {
			const e = new ((_params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
			captureStackTrace(e, _params?.callee ?? fn);
			throw e;
		}
		return result.value;
	};
	return fn;
};
var _parseAsync = (_Err) => {
	const fn = async (schema, value, _ctx, params) => {
		const ctx = _ctx ? {
			..._ctx,
			async: true
		} : { async: true };
		let result = schema._zod.run({
			value,
			issues: []
		}, ctx);
		if (result instanceof Promise) result = await result;
		if (result.issues.length) {
			const e = new ((params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
			captureStackTrace(e, params?.callee ?? fn);
			throw e;
		}
		return result.value;
	};
	return fn;
};
var _safeParse = (_Err) => (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		async: false
	} : { async: false };
	const result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) throw new $ZodAsyncError();
	return result.issues.length ? failure(_Err, result.issues, ctx) : {
		success: true,
		data: result.value
	};
};
function failure(Err, issues, ctx) {
	let error;
	return {
		success: false,
		get error() {
			if (!error) {
				error = new Err(issues.map((iss) => finalizeIssue(iss, ctx, config())));
				issues = void 0;
				ctx = void 0;
			}
			return error;
		},
		set error(e) {
			error = e;
			issues = void 0;
			ctx = void 0;
		}
	};
}
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		async: true
	} : { async: true };
	let result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) result = await result;
	return result.issues.length ? failure(_Err, result.issues, ctx) : {
		success: true,
		data: result.value
	};
};
var COMPILE_INVALID = /* @__PURE__ */ Symbol.for("zod.compile.invalid");
var COMPILE_FALLBACK = /* @__PURE__ */ Symbol.for("zod.compile.fallback");
var validate = ((schema, value, _ctx) => {
	const validator = schema._zod.bag.validator;
	if (validator !== void 0) {
		if (validator(value) !== COMPILE_INVALID) return true;
		if (validator.definite === true && _ctx === void 0) return false;
	}
	return validateFallback(schema, value, _ctx);
});
function validateFallback(schema, value, _ctx) {
	const ctx = _ctx ? {
		..._ctx,
		async: false,
		abortEarly: true
	} : {
		async: false,
		abortEarly: true
	};
	const fallbackRun = schema._zod.bag.fallbackRun;
	let result;
	if (fallbackRun) {
		ctx[COMPILE_FALLBACK] = true;
		result = fallbackRun({
			value,
			issues: []
		}, ctx);
	} else result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) throw new $ZodAsyncError();
	return result.issues.length === 0;
}
var validateAsync$1 = async (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		async: true,
		abortEarly: true
	} : {
		async: true,
		abortEarly: true
	};
	let result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) result = await result;
	return result.issues.length === 0;
};
var _encode = (_Err) => {
	const parse = _parse(_Err);
	const fn = (schema, value, _ctx, _params) => {
		const ctx = _ctx ? {
			..._ctx,
			direction: "backward"
		} : { direction: "backward" };
		return parse(schema, value, ctx, finalizeParams(fn, _params));
	};
	return fn;
};
var _decode = (_Err) => {
	const parse = _parse(_Err);
	const fn = (schema, value, _ctx, _params) => {
		return parse(schema, value, _ctx, finalizeParams(fn, _params));
	};
	return fn;
};
var _encodeAsync = (_Err) => {
	const parseAsync = _parseAsync(_Err);
	const fn = async (schema, value, _ctx, _params) => {
		const ctx = _ctx ? {
			..._ctx,
			direction: "backward"
		} : { direction: "backward" };
		return await parseAsync(schema, value, ctx, finalizeParams(fn, _params));
	};
	return fn;
};
var _decodeAsync = (_Err) => {
	const parseAsync = _parseAsync(_Err);
	const fn = async (schema, value, _ctx, _params) => {
		return await parseAsync(schema, value, _ctx, finalizeParams(fn, _params));
	};
	return fn;
};
var _safeEncode = (_Err) => (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		direction: "backward"
	} : { direction: "backward" };
	return _safeParse(_Err)(schema, value, ctx);
};
var _safeDecode = (_Err) => (schema, value, _ctx) => {
	return _safeParse(_Err)(schema, value, _ctx);
};
var _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		direction: "backward"
	} : { direction: "backward" };
	return _safeParseAsync(_Err)(schema, value, ctx);
};
var _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
	return _safeParseAsync(_Err)(schema, value, _ctx);
};
// node_modules/zod/v4/core/regexes.js
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link cuid2} instead.
* See https://github.com/paralleldrive/cuid.
*/
var cuid = /^[cC][0-9a-z]{6,}$/;
var cuid2 = /^[0-9a-z]+$/;
var ulid = /^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$/;
var xid = /^[0-9a-vA-V]{20}$/;
var ksuid = /^[A-Za-z0-9]{27}$/;
var nanoid = /^[a-zA-Z0-9_-]{21}$/;
function nanoidOfLength(length) {
	return new RegExp(`^[a-zA-Z0-9_-]{${length}}$`);
}
/** ISO 8601-1 duration regex. Does not support the 8601-2 extensions like negative durations or fractional/negative components. */
var duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
/** A regex for any UUID-like identifier: 8-4-4-4-12 hex pattern */
var guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
/** Returns a regex for validating an RFC 9562/4122 UUID.
*
* @param version Optionally specify a version 1-8. If no version is specified, all versions are supported. */
var uuid = (version) => {
	if (!version) return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
	return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
};
/** Practical email validation */
var email = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
var _emoji$1 = `^(?=[\\s\\S]*[\\p{Extended_Pictographic}\\p{Regional_Indicator}\\u20E3])[\\p{Extended_Pictographic}\\p{Emoji_Component}]+$`;
function emoji() {
	return new RegExp(_emoji$1, "u");
}
var ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
var cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
var cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
var base64url = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2,3})?$/;
var httpProtocol = /^https?$/;
var e164 = /^\+[1-9]\d{6,14}$/;
var dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
/** Anchors a pattern source. The interpolation lives here rather than at the call site because
* esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it
* will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */
function anchor(source) {
	return new RegExp(`^${source}$`);
}
var date = /*@__PURE__*/ anchor(dateSource);
function timeSource(args) {
	const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
	return typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : args.seconds ? `${hhmm}:[0-5]\\d(?:\\.\\d+)?` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
}
function time(args) {
	return new RegExp(`^${timeSource(args)}$`);
}
function datetime(args) {
	const opts = ["Z"];
	if (args.offset) opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
	const qualified = `${timeSource({
		precision: args.precision,
		seconds: true
	})}(?:${opts.join("|")})`;
	const timeRegex = args.local ? `${qualified}|${timeSource({ precision: args.precision })}` : qualified;
	return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
var anyString = /^[\s\S]{0,}$/;
var integer = /^-?\d+$/;
var number$1 = /^-?\d+(?:\.\d+)?$/;
var boolean$1 = /^(?:true|false)$/i;
var _null$2 = /^null$/i;
var lowercase = /^[^A-Z]*$/;
var uppercase = /^[^a-z]*$/;
// node_modules/zod/v4/core/checks.js
var $ZodCheck = /*@__PURE__*/ $constructor("$ZodCheck", (inst, def) => {
	var _a;
	inst._zod ?? (inst._zod = {});
	inst._zod.def = def;
	(_a = inst._zod).onattach ?? (_a.onattach = []);
});
/** Default `when` for length-based checks: run only on non-nullish values with a `length`. */
var _whenHasLength = (payload) => {
	const val = payload.value;
	return !nullish(val) && val.length !== void 0;
};
var numericOriginMap = {
	number: "number",
	bigint: "bigint",
	object: "date"
};
var $ZodCheckLessThan = /*@__PURE__*/ $constructor("$ZodCheckLessThan", (inst, def) => {
	$ZodCheck.init(inst, def);
	const origin = numericOriginMap[typeof def.value];
	inst._zod.check = (payload) => {
		if (def.inclusive ? payload.value <= def.value : payload.value < def.value) return;
		payload.issues.push({
			origin: numericOriginMap[typeof payload.value] ?? origin,
			code: "too_big",
			maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
			input: payload.value,
			inclusive: def.inclusive,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckGreaterThan = /*@__PURE__*/ $constructor("$ZodCheckGreaterThan", (inst, def) => {
	$ZodCheck.init(inst, def);
	const origin = numericOriginMap[typeof def.value];
	inst._zod.check = (payload) => {
		if (def.inclusive ? payload.value >= def.value : payload.value > def.value) return;
		payload.issues.push({
			origin: numericOriginMap[typeof payload.value] ?? origin,
			code: "too_small",
			minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
			input: payload.value,
			inclusive: def.inclusive,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckMultipleOf = /*@__PURE__*/ $constructor("$ZodCheckMultipleOf", (inst, def) => {
	$ZodCheck.init(inst, def);
	inst._zod.check = (payload) => {
		if (typeof payload.value !== typeof def.value) throw new Error("Cannot mix number and bigint in multiple_of check.");
		if (typeof payload.value === "bigint" ? def.value !== BigInt(0) && payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0) return;
		payload.issues.push({
			origin: typeof payload.value,
			code: "not_multiple_of",
			divisor: def.value,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckNumberFormat = /*@__PURE__*/ $constructor("$ZodCheckNumberFormat", (inst, def) => {
	$ZodCheck.init(inst, def);
	def.format = def.format || "float64";
	const isInt = def.format?.includes("int");
	const origin = isInt ? "int" : "number";
	const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
	inst._zod.check = (payload) => {
		const input = payload.value;
		if (isInt) {
			if (!Number.isInteger(input)) {
				payload.issues.push({
					expected: origin,
					format: def.format,
					code: "invalid_type",
					continue: false,
					input,
					inst
				});
				return;
			}
			if (!Number.isSafeInteger(input)) {
				if (input > 0) payload.issues.push({
					input,
					code: "too_big",
					maximum: Number.MAX_SAFE_INTEGER,
					note: "Integers must be within the safe integer range.",
					inst,
					origin,
					inclusive: true,
					continue: !def.abort
				});
				else payload.issues.push({
					input,
					code: "too_small",
					minimum: Number.MIN_SAFE_INTEGER,
					note: "Integers must be within the safe integer range.",
					inst,
					origin,
					inclusive: true,
					continue: !def.abort
				});
				return;
			}
		}
		if (input < minimum) payload.issues.push({
			origin: "number",
			input,
			code: "too_small",
			minimum,
			inclusive: true,
			inst,
			continue: !def.abort
		});
		if (input > maximum) payload.issues.push({
			origin: "number",
			input,
			code: "too_big",
			maximum,
			inclusive: true,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckMaxLength = /*@__PURE__*/ $constructor("$ZodCheckMaxLength", (inst, def) => {
	var _a;
	$ZodCheck.init(inst, def);
	(_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
	inst._zod.check = (payload) => {
		const input = payload.value;
		const units = input.length;
		if ((typeof input === "string" && units > def.maximum ? codePointLength(input) : units) <= def.maximum) return;
		const origin = getLengthableOrigin(input);
		payload.issues.push({
			origin,
			code: "too_big",
			maximum: def.maximum,
			inclusive: true,
			input,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckMinLength = /*@__PURE__*/ $constructor("$ZodCheckMinLength", (inst, def) => {
	var _a;
	$ZodCheck.init(inst, def);
	(_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
	inst._zod.check = (payload) => {
		const input = payload.value;
		const units = input.length;
		if ((typeof input === "string" && units >= def.minimum && units < def.minimum * 2 ? codePointLength(input) : units) >= def.minimum) return;
		const origin = getLengthableOrigin(input);
		payload.issues.push({
			origin,
			code: "too_small",
			minimum: def.minimum,
			inclusive: true,
			input,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckLengthEquals = /*@__PURE__*/ $constructor("$ZodCheckLengthEquals", (inst, def) => {
	var _a;
	$ZodCheck.init(inst, def);
	(_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
	inst._zod.check = (payload) => {
		const input = payload.value;
		const units = input.length;
		const length = typeof input === "string" && units >= def.length && units <= def.length * 2 ? codePointLength(input) : units;
		if (length === def.length) return;
		const origin = getLengthableOrigin(input);
		const tooBig = length > def.length;
		payload.issues.push({
			origin,
			...tooBig ? {
				code: "too_big",
				maximum: def.length
			} : {
				code: "too_small",
				minimum: def.length
			},
			inclusive: true,
			exact: true,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckStringFormat = /*@__PURE__*/ $constructor("$ZodCheckStringFormat", (inst, def) => {
	var _a, _b;
	$ZodCheck.init(inst, def);
	if (def.pattern) (_a = inst._zod).check ?? (_a.check = (payload) => {
		def.pattern.lastIndex = 0;
		if (def.pattern.test(payload.value)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: def.format,
			input: payload.value,
			...def.pattern ? { pattern: def.pattern.toString() } : {},
			inst,
			continue: !def.abort
		});
	});
	else (_b = inst._zod).check ?? (_b.check = () => {});
});
var $ZodCheckRegex = /*@__PURE__*/ $constructor("$ZodCheckRegex", (inst, def) => {
	$ZodCheckStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		def.pattern.lastIndex = 0;
		if (def.pattern.test(payload.value)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "regex",
			input: payload.value,
			pattern: def.pattern.toString(),
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckLowerCase = /*@__PURE__*/ $constructor("$ZodCheckLowerCase", (inst, def) => {
	def.pattern ?? (def.pattern = lowercase);
	$ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckUpperCase = /*@__PURE__*/ $constructor("$ZodCheckUpperCase", (inst, def) => {
	def.pattern ?? (def.pattern = uppercase);
	$ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckIncludes = /*@__PURE__*/ $constructor("$ZodCheckIncludes", (inst, def) => {
	$ZodCheck.init(inst, def);
	const escapedRegex = escapeRegex(def.includes);
	def.pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position},}${escapedRegex}` : escapedRegex);
	inst._zod.check = (payload) => {
		if (payload.value.includes(def.includes, def.position)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "includes",
			includes: def.includes,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckStartsWith = /*@__PURE__*/ $constructor("$ZodCheckStartsWith", (inst, def) => {
	$ZodCheck.init(inst, def);
	const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
	def.pattern ?? (def.pattern = pattern);
	inst._zod.check = (payload) => {
		if (payload.value.startsWith(def.prefix)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "starts_with",
			prefix: def.prefix,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckEndsWith = /*@__PURE__*/ $constructor("$ZodCheckEndsWith", (inst, def) => {
	$ZodCheck.init(inst, def);
	const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
	def.pattern ?? (def.pattern = pattern);
	inst._zod.check = (payload) => {
		if (payload.value.endsWith(def.suffix)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "ends_with",
			suffix: def.suffix,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckOverwrite = /*@__PURE__*/ $constructor("$ZodCheckOverwrite", (inst, def) => {
	$ZodCheck.init(inst, def);
	inst._zod.check = (payload) => {
		payload.value = def.tx(payload.value);
	};
});
// node_modules/zod/v4/core/doc.js
var Doc = class {
	constructor(args = [], closed = {}) {
		this.content = [];
		this.indent = 0;
		this.args = args;
		this.closed = closed;
	}
	indented(fn) {
		this.indent += 1;
		try {
			fn(this);
		} finally {
			this.indent -= 1;
		}
	}
	write(arg) {
		if (typeof arg === "function") {
			arg(this, { execution: "sync" });
			arg(this, { execution: "async" });
			return;
		}
		const lines = arg.split("\n").filter((x) => x);
		const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
		const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
		for (const line of dedented) this.content.push(line);
	}
	compile() {
		const F = Function;
		const content = this?.content ?? [``];
		return new F(...Object.keys(this.closed), `return function (${this.args.join(", ")}) {\n${content.join("\n")}\n};`)(...Object.values(this.closed));
	}
};
// node_modules/zod/v4/core/versions.js
var version = {
	major: 4,
	minor: 6,
	patch: 7
};
// node_modules/zod/v4/core/schemas.js
var $ZodType = /*@__PURE__*/ $constructor("$ZodType", (inst, def) => {
	var _a;
	inst ?? (inst = {});
	inst._zod.def = def;
	inst._zod.bag = inst._zod.bag || {};
	inst._zod.version = version;
	const defChecks = inst._zod.def.checks;
	const checks = inst._zod.traits.has("$ZodCheck") ? [inst, ...defChecks ?? []] : defChecks?.length ? [...defChecks] : [];
	for (const ch of checks) for (const fn of ch._zod.onattach) fn(inst);
	if (checks.length === 0) {
		(_a = inst._zod).deferred ?? (_a.deferred = []);
		inst._zod.deferred?.push(() => {
			inst._zod.run = inst._zod.parse;
		});
	} else {
		const runChecks = (payload, checks, ctx) => {
			if (payload.memo) return payload;
			let isAborted = aborted(payload);
			let asyncResult;
			for (const ch of checks) {
				if (ch._zod.def.when) {
					if (explicitlyAborted(payload)) continue;
					if (!ch._zod.def.when(payload)) continue;
				} else if (isAborted) continue;
				const currLen = payload.issues.length;
				const _ = ch._zod.check(payload);
				if (_ instanceof Promise && ctx?.async === false) throw new $ZodAsyncError();
				if (asyncResult || _ instanceof Promise) asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
					await _;
					if (payload.issues.length === currLen) return;
					attachSchema(payload.issues, currLen, inst);
					if (!isAborted) isAborted = aborted(payload, currLen);
				});
				else {
					if (payload.issues.length === currLen) continue;
					attachSchema(payload.issues, currLen, inst);
					if (!isAborted) isAborted = aborted(payload, currLen);
				}
			}
			if (asyncResult) return asyncResult.then(() => {
				return payload;
			});
			return payload;
		};
		const handleCanaryResult = (canary, payload, ctx) => {
			if (aborted(canary)) {
				canary.aborted = true;
				return canary;
			}
			const checkResult = runChecks(payload, checks, ctx);
			if (checkResult instanceof Promise) {
				if (ctx.async === false) throw new $ZodAsyncError();
				return checkResult.then((checkResult) => inst._zod.parse(checkResult, ctx));
			}
			return inst._zod.parse(checkResult, ctx);
		};
		inst._zod.run = (payload, ctx) => {
			if (ctx.skipChecks) return inst._zod.parse(payload, ctx);
			if (ctx.direction === "backward") {
				const canary = inst._zod.parse({
					value: payload.value,
					issues: []
				}, {
					...ctx,
					skipChecks: true
				});
				if (canary instanceof Promise) return canary.then((canary) => {
					return handleCanaryResult(canary, payload, ctx);
				});
				return handleCanaryResult(canary, payload, ctx);
			}
			const result = inst._zod.parse(payload, ctx);
			if (result instanceof Promise) {
				if (ctx.async === false) throw new $ZodAsyncError();
				return result.then((result) => runChecks(result, checks, ctx));
			}
			return runChecks(result, checks, ctx);
		};
	}
}, {
	get "~standard"() {
		return hide(this, "~standard", standardProps(this));
	},
	set "~standard"(value) {
		own(this, "~standard", value);
	}
});
/** The Standard Schema surface for `inst`. Shared so wrappers can extend it without forcing it. */
var toStandardResult = (r, ctx) => r.issues.length ? { issues: r.issues.map((iss) => finalizeIssue(iss, ctx, config())) } : { value: r.value };
async function validateAsync(inst, value) {
	const ctx = { async: true };
	return toStandardResult(await inst._zod.run({
		value,
		issues: []
	}, ctx), ctx);
}
function standardProps(inst) {
	return {
		validate: (value) => {
			const ctx = { async: false };
			try {
				const r = inst._zod.run({
					value,
					issues: []
				}, ctx);
				if (!(r instanceof Promise)) return toStandardResult(r, ctx);
			} catch (_) {}
			return validateAsync(inst, value);
		},
		vendor: "zod",
		version: 1
	};
}
var $ZodString = /*@__PURE__*/ $constructor("$ZodString", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = def.pattern ?? anyString;
	inst._zod.parse = (payload, _) => {
		if (def.coerce) try {
			payload.value = String(payload.value);
		} catch (_) {}
		if (typeof payload.value === "string") return payload;
		payload.issues.push({
			expected: "string",
			code: "invalid_type",
			input: payload.value,
			inst
		});
		return payload;
	};
});
var $ZodStringFormat = /*@__PURE__*/ $constructor("$ZodStringFormat", (inst, def) => {
	$ZodCheckStringFormat.init(inst, def);
	$ZodString.init(inst, def);
});
var $ZodGUID = /*@__PURE__*/ $constructor("$ZodGUID", (inst, def) => {
	def.pattern ?? (def.pattern = guid);
	$ZodStringFormat.init(inst, def);
});
var $ZodUUID = /*@__PURE__*/ $constructor("$ZodUUID", (inst, def) => {
	if (def.version) {
		const v = {
			v1: 1,
			v2: 2,
			v3: 3,
			v4: 4,
			v5: 5,
			v6: 6,
			v7: 7,
			v8: 8
		}[def.version];
		if (v === void 0) throw new Error(`Invalid UUID version: "${def.version}"`);
		def.pattern ?? (def.pattern = uuid(v));
	} else def.pattern ?? (def.pattern = uuid());
	$ZodStringFormat.init(inst, def);
});
var $ZodEmail = /*@__PURE__*/ $constructor("$ZodEmail", (inst, def) => {
	def.pattern ?? (def.pattern = email);
	$ZodStringFormat.init(inst, def);
});
function canParseURL(input) {
	try {
		if (typeof URL !== "undefined" && typeof URL.canParse === "function") return URL.canParse(input);
		new URL(input);
		return true;
	} catch {
		return false;
	}
}
function validateURL(trimmed, def) {
	if (!("normalize" in def) && !("hostname" in def) && !("protocol" in def)) return canParseURL(trimmed) || 2;
	return parseURLObject(trimmed, def);
}
/** Parses a URL while preserving the non-normalizing HTTP guard. */
function parseURLObject(trimmed, def) {
	if (!def.normalize && def.protocol?.source === httpProtocol.source && !/^https?:\/\//i.test(trimmed)) return 1;
	try {
		if (typeof URL !== "undefined") {
			const URLStatic = URL;
			if (typeof URLStatic.parse === "function") return URLStatic.parse(trimmed) ?? 2;
		}
		return new URL(trimmed);
	} catch {
		return 2;
	}
}
var asciiTabOrNewline = /[\t\n\r]/g;
/** The URL parser deletes every ASCII tab, LF and CR from its input before it parses, so `new URL("https://exa\nmple.com")` reports on `example.com`. Applying the same deletion to the returned value closes the half of that divergence which can move the host; the parser's other rewrite, stripping C0 controls at the edges, cannot. */
function stripTabAndNewline(value) {
	return value.replace(asciiTabOrNewline, "");
}
function urlHostnameOk(url, hostname) {
	hostname.lastIndex = 0;
	return hostname.test(url.hostname);
}
function urlProtocolOk(url, protocol) {
	protocol.lastIndex = 0;
	return protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol);
}
var $ZodURL = /*@__PURE__*/ $constructor("$ZodURL", (inst, def) => {
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		try {
			const trimmed = payload.value.trim();
			const url = validateURL(trimmed, def);
			if (url === 1) {
				payload.issues.push({
					code: "invalid_format",
					format: "url",
					note: "Invalid URL format",
					input: payload.value,
					inst,
					continue: !def.abort
				});
				return;
			}
			if (url === 2) {
				payload.issues.push({
					code: "invalid_format",
					format: "url",
					input: payload.value,
					inst,
					continue: !def.abort
				});
				return;
			}
			if (url === true) {
				payload.value = stripTabAndNewline(trimmed);
				return;
			}
			if (def.hostname && !urlHostnameOk(url, def.hostname)) payload.issues.push({
				code: "invalid_format",
				format: "url",
				note: "Invalid hostname",
				pattern: def.hostname.source,
				input: payload.value,
				inst,
				continue: !def.abort
			});
			if (def.protocol && !urlProtocolOk(url, def.protocol)) payload.issues.push({
				code: "invalid_format",
				format: "url",
				note: "Invalid protocol",
				pattern: def.protocol.source,
				input: payload.value,
				inst,
				continue: !def.abort
			});
			payload.value = def.normalize ? url.href : stripTabAndNewline(trimmed);
			return;
		} catch (_) {
			payload.issues.push({
				code: "invalid_format",
				format: "url",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		}
	};
});
var $ZodEmoji = /*@__PURE__*/ $constructor("$ZodEmoji", (inst, def) => {
	def.pattern ?? (def.pattern = emoji());
	$ZodStringFormat.init(inst, def);
});
var $ZodNanoID = /*@__PURE__*/ $constructor("$ZodNanoID", (inst, def) => {
	if (def.length !== void 0 && (!Number.isInteger(def.length) || def.length < 1)) throw new Error(`Invalid nanoid length: ${def.length}`);
	def.pattern ?? (def.pattern = def.length === void 0 ? nanoid : nanoidOfLength(def.length));
	$ZodStringFormat.init(inst, def);
});
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link $ZodCUID2} instead.
* See https://github.com/paralleldrive/cuid.
*/
var $ZodCUID = /*@__PURE__*/ $constructor("$ZodCUID", (inst, def) => {
	def.pattern ?? (def.pattern = cuid);
	$ZodStringFormat.init(inst, def);
});
var $ZodCUID2 = /*@__PURE__*/ $constructor("$ZodCUID2", (inst, def) => {
	def.pattern ?? (def.pattern = cuid2);
	$ZodStringFormat.init(inst, def);
});
var $ZodULID = /*@__PURE__*/ $constructor("$ZodULID", (inst, def) => {
	def.pattern ?? (def.pattern = ulid);
	$ZodStringFormat.init(inst, def);
});
var $ZodXID = /*@__PURE__*/ $constructor("$ZodXID", (inst, def) => {
	def.pattern ?? (def.pattern = xid);
	$ZodStringFormat.init(inst, def);
});
var $ZodKSUID = /*@__PURE__*/ $constructor("$ZodKSUID", (inst, def) => {
	def.pattern ?? (def.pattern = ksuid);
	$ZodStringFormat.init(inst, def);
});
var $ZodISODateTime = /*@__PURE__*/ $constructor("$ZodISODateTime", (inst, def) => {
	def.pattern ?? (def.pattern = datetime(def));
	$ZodStringFormat.init(inst, def);
});
var $ZodISODate = /*@__PURE__*/ $constructor("$ZodISODate", (inst, def) => {
	def.pattern ?? (def.pattern = date);
	$ZodStringFormat.init(inst, def);
});
var $ZodISOTime = /*@__PURE__*/ $constructor("$ZodISOTime", (inst, def) => {
	def.pattern ?? (def.pattern = time(def));
	$ZodStringFormat.init(inst, def);
});
var $ZodISODuration = /*@__PURE__*/ $constructor("$ZodISODuration", (inst, def) => {
	def.pattern ?? (def.pattern = duration);
	$ZodStringFormat.init(inst, def);
});
var $ZodIPv4 = /*@__PURE__*/ $constructor("$ZodIPv4", (inst, def) => {
	def.pattern ?? (def.pattern = ipv4);
	$ZodStringFormat.init(inst, def);
});
/** An IPv6 address is written with hex digits, colons and dots, and nothing else. The guard is what makes the check below an IPv6 check: `new URL("http://[...]")` parses an authority, not an address, so `@` and `\` re-delimit it and `"::@1\\"` validates against the host `0.0.0.1`. The URL parser also deletes ASCII tab, LF and CR rather than failing, which is how `"::1\n"` validated as `::1`. */
var ipv6Alphabet = /^[0-9a-fA-F:.]+$/;
function isValidIPv6(value) {
	if (!ipv6Alphabet.test(value)) return false;
	return canParseURL(`http://[${value}]`);
}
var $ZodIPv6 = /*@__PURE__*/ $constructor("$ZodIPv6", (inst, def) => {
	def.pattern ?? (def.pattern = ipv6);
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		if (!isValidIPv6(payload.value)) payload.issues.push({
			code: "invalid_format",
			format: "ipv6",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCIDRv4 = /*@__PURE__*/ $constructor("$ZodCIDRv4", (inst, def) => {
	def.pattern ?? (def.pattern = cidrv4);
	$ZodStringFormat.init(inst, def);
});
function isValidCIDRv6(value) {
	const parts = value.split("/");
	if (parts.length !== 2) return false;
	const [address, prefix] = parts;
	if (!prefix) return false;
	const prefixNum = Number(prefix);
	if (`${prefixNum}` !== prefix) return false;
	if (prefixNum < 0 || prefixNum > 128) return false;
	return isValidIPv6(address);
}
var $ZodCIDRv6 = /*@__PURE__*/ $constructor("$ZodCIDRv6", (inst, def) => {
	def.pattern ?? (def.pattern = cidrv6);
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		if (!isValidCIDRv6(payload.value)) payload.issues.push({
			code: "invalid_format",
			format: "cidrv6",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
function isValidBase64(data) {
	if (data === "") return true;
	if (/\s/.test(data)) return false;
	if (data.length % 4 !== 0) return false;
	try {
		atob(data);
		return true;
	} catch {
		return false;
	}
}
var base64Charset = /^[0-9a-zA-Z+/]*={0,2}$/;
var $ZodBase64 = /*@__PURE__*/ $constructor("$ZodBase64", (inst, def) => {
	def.pattern ?? (def.pattern = base64Charset);
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		if (isValidBase64(payload.value)) return;
		payload.issues.push({
			code: "invalid_format",
			format: "base64",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var base64urlCharset = /^[A-Za-z0-9_-]*$/;
function isValidBase64URL(data) {
	if (!base64urlCharset.test(data)) return false;
	const base64 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
	return isValidBase64(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
}
var $ZodBase64URL = /*@__PURE__*/ $constructor("$ZodBase64URL", (inst, def) => {
	def.pattern ?? (def.pattern = base64urlCharset);
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		if (isValidBase64URL(payload.value)) return;
		payload.issues.push({
			code: "invalid_format",
			format: "base64url",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodE164 = /*@__PURE__*/ $constructor("$ZodE164", (inst, def) => {
	def.pattern ?? (def.pattern = e164);
	$ZodStringFormat.init(inst, def);
});
function isValidJWT(token, algorithm = null) {
	try {
		const tokensParts = token.split(".");
		if (tokensParts.length !== 3) return false;
		const [header] = tokensParts;
		if (!header) return false;
		const parsedHeader = JSON.parse(atob(header));
		if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT") return false;
		if (!parsedHeader.alg) return false;
		if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm)) return false;
		return true;
	} catch {
		return false;
	}
}
var $ZodJWT = /*@__PURE__*/ $constructor("$ZodJWT", (inst, def) => {
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		if (isValidJWT(payload.value, def.alg)) return;
		payload.issues.push({
			code: "invalid_format",
			format: "jwt",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodNumber = /*@__PURE__*/ $constructor("$ZodNumber", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = number$1;
	inst._zod.parse = (payload, _ctx) => {
		if (def.coerce) try {
			payload.value = Number(payload.value);
		} catch (_) {}
		const input = payload.value;
		if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) return payload;
		const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? String(input) : void 0 : void 0;
		payload.issues.push({
			expected: "number",
			code: "invalid_type",
			input,
			inst,
			...received ? { received } : {}
		});
		return payload;
	};
});
var $ZodNumberFormat = /*@__PURE__*/ $constructor("$ZodNumberFormat", (inst, def) => {
	$ZodCheckNumberFormat.init(inst, def);
	$ZodNumber.init(inst, def);
});
var $ZodBoolean = /*@__PURE__*/ $constructor("$ZodBoolean", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = boolean$1;
	inst._zod.parse = (payload, _ctx) => {
		if (def.coerce) try {
			payload.value = Boolean(payload.value);
		} catch (_) {}
		const input = payload.value;
		if (typeof input === "boolean") return payload;
		payload.issues.push({
			expected: "boolean",
			code: "invalid_type",
			input,
			inst
		});
		return payload;
	};
});
var $ZodNull = /*@__PURE__*/ $constructor("$ZodNull", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = _null$2;
	inst._zod.values = /* @__PURE__ */ new Set([null]);
	inst._zod.parse = (payload, _ctx) => {
		const input = payload.value;
		if (input === null) return payload;
		payload.issues.push({
			expected: "null",
			code: "invalid_type",
			input,
			inst
		});
		return payload;
	};
});
var $ZodUnknown = /*@__PURE__*/ $constructor("$ZodUnknown", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload) => payload;
});
var $ZodNever = /*@__PURE__*/ $constructor("$ZodNever", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, _ctx) => {
		payload.issues.push({
			expected: "never",
			code: "invalid_type",
			input: payload.value,
			inst
		});
		return payload;
	};
});
function capSize(inst, size) {
	const caps = sizeCaps(inst._zod.def.checks);
	if (!caps.length) return;
	const cap = Math.min(...caps.map((c) => c[0]));
	const parse = inst._zod.parse;
	inst._zod.parse = (payload, ctx) => {
		const n = size(payload.value);
		if (n > cap && !ctx?.skipChecks && ctx?.direction !== "backward") {
			for (const [max, ch] of sizeCaps(inst._zod.def.checks)) if (n > max && ch._zod.def.when(payload)) {
				const start = payload.issues.length;
				ch._zod.check(payload);
				payload.issues[start].continue = false;
				attachSchema(payload.issues, start, inst);
				return payload;
			}
		}
		return parse(payload, ctx);
	};
}
var arraySize = (input) => Array.isArray(input) ? input.length : -1;
function handleArrayResult(result, final, index) {
	if (result.issues.length) final.issues.push(...prefixIssues(index, result.issues));
	final.value[index] = result.value;
}
var $ZodArray = /*@__PURE__*/ $constructor("$ZodArray", (inst, def) => {
	$ZodType.init(inst, def);
	const memo = globalConfig.memoizer;
	memo?.attach(inst);
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		if (!Array.isArray(input)) {
			payload.issues.push({
				expected: "array",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		payload.value = memo ? memo.alloc(inst, payload, Array(input.length), ctx) : Array(input.length);
		const proms = [];
		const abortEarly = ctx?.abortEarly;
		for (let i = 0; i < input.length; i++) {
			const item = input[i];
			const result = def.element._zod.run({
				value: item,
				issues: []
			}, ctx);
			if (result instanceof Promise) proms.push(result.then((result) => handleArrayResult(result, payload, i)));
			else {
				handleArrayResult(result, payload, i);
				if (abortEarly && result.issues.length !== 0 && aborted(result)) break;
			}
		}
		if (proms.length) return Promise.all(proms).then(() => payload);
		return payload;
	};
	capSize(inst, arraySize);
});
function handlePropertyResult(result, final, key, input, optin, optout) {
	const isPresent = key in input;
	const isOptionalOut = optout === "optional";
	if (!isPresent && isOptionalOut && optin === "optional") return;
	if (result.issues.length) {
		if (optin !== void 0 && isOptionalOut && !isPresent) return;
		final.issues.push(...prefixIssues(key, result.issues));
	}
	if (!isPresent && optin === void 0) {
		if (!result.issues.length) final.issues.push({
			code: "invalid_type",
			expected: "nonoptional",
			input: void 0,
			path: [key]
		});
		return;
	}
	if (result.value === void 0) {
		if (isPresent || optin === "defaulted" && !isOptionalOut) final.value[key] = void 0;
	} else final.value[key] = result.value;
}
var NO_SYMBOL_KEYS = [];
function normalizeDef(def) {
	const keys = Object.keys(def.shape);
	const ownSymbols = Object.getOwnPropertySymbols(def.shape);
	const symbolKeys = ownSymbols.length ? ownSymbols : NO_SYMBOL_KEYS;
	const allKeys = symbolKeys.length ? [...keys, ...symbolKeys] : keys;
	for (const k of allKeys) if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) throw new Error(`Invalid element at key "${String(k)}": expected a Zod schema`);
	const okeys = optionalKeys(def.shape);
	return {
		...def,
		allKeys,
		symbolKeys,
		keySet: new Set(keys),
		numKeys: keys.length,
		optionalKeys: new Set(okeys)
	};
}
function handleCatchall(proms, input, payload, ctx, def, inst, abortEarly) {
	const unrecognized = [];
	const keySet = def.keySet;
	const _catchall = def.catchall._zod;
	const t = _catchall.def.type;
	const optin = _catchall.optin;
	const optout = _catchall.optout;
	let seen = 0;
	for (const key in input) {
		if (abortEarly && payload.issues.length !== seen) {
			if (aborted(payload, seen)) break;
			seen = payload.issues.length;
		}
		if (keySet.has(key)) continue;
		if (key === "__proto__") {
			if (t === "never") unrecognized.push(key);
			continue;
		}
		if (t === "never") {
			unrecognized.push(key);
			continue;
		}
		const r = _catchall.run({
			value: input[key],
			issues: []
		}, ctx);
		if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, optin, optout)));
		else handlePropertyResult(r, payload, key, input, optin, optout);
	}
	if (unrecognized.length) payload.issues.push({
		code: "unrecognized_keys",
		keys: unrecognized,
		input,
		inst,
		continue: true
	});
	if (!proms.length) return payload;
	return Promise.all(proms).then(() => {
		return payload;
	});
}
var $ZodObject = /*@__PURE__*/ $constructor("$ZodObject", (inst, def) => {
	$ZodType.init(inst, def);
	const desc = Object.getOwnPropertyDescriptor(def, "shape");
	const sh = desc?.get ? desc.get.raw : def.shape ?? {};
	if (sh) {
		const get = () => {
			const newSh = { ...sh };
			Object.defineProperty(def, "shape", { value: newSh });
			get.raw = newSh;
			return newSh;
		};
		get.raw = sh;
		Object.defineProperty(def, "shape", { get });
	}
	const _normalized = cached(() => normalizeDef(def));
	defineLazyInternal(inst, "propValues", (zod) => {
		const shape = zod.def.shape;
		const propValues = {};
		for (const key in shape) {
			const field = shape[key]._zod;
			if (field.values) {
				if (!Object.prototype.hasOwnProperty.call(propValues, key)) assignProp(propValues, key, /* @__PURE__ */ new Set());
				for (const v of field.values) propValues[key].add(v);
				if (field.optin !== void 0) propValues[key].add(void 0);
			}
		}
		return propValues;
	});
	const isObject$1 = isObject;
	const catchall = def.catchall;
	let value;
	const memo = globalConfig.memoizer;
	memo?.attach(inst);
	inst._zod.parse = (payload, ctx) => {
		value ?? (value = _normalized.value);
		const input = payload.value;
		if (!isObject$1(input)) {
			payload.issues.push({
				expected: "object",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
		const proms = [];
		const shape = value.shape;
		const abortEarly = ctx?.abortEarly;
		let seen = payload.issues.length;
		for (const key of value.allKeys) {
			if (abortEarly && payload.issues.length !== seen) {
				if (aborted(payload, seen)) break;
				seen = payload.issues.length;
			}
			if (key === "__proto__") continue;
			const el = shape[key];
			const optin = el._zod.optin;
			const optout = el._zod.optout;
			const r = el._zod.run({
				value: input[key],
				issues: []
			}, ctx);
			if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, optin, optout)));
			else handlePropertyResult(r, payload, key, input, optin, optout);
		}
		if (!catchall) return proms.length ? Promise.all(proms).then(() => payload) : payload;
		return handleCatchall(proms, input, payload, ctx, _normalized.value, inst, abortEarly === true);
	};
});
var $ZodObjectJIT = /*@__PURE__*/ $constructor("$ZodObjectJIT", (inst, def) => {
	$ZodObject.init(inst, def);
	const superParse = inst._zod.parse;
	const _normalized = cached(() => normalizeDef(def));
	const memo = globalConfig.memoizer;
	const generateFastpass = (shape) => {
		const normalized = _normalized.value;
		const syms = normalized.symbolKeys;
		const doc = new Doc(["payload", "ctx"], {
			shape,
			inst,
			memo,
			syms
		});
		const parseStr = (k) => `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
		const prefixStr = (id, k) => `
          let ${id}_ab = false;
          for (let i = 0; i < ${id}.issues.length; i++) {
            const iss = ${id}.issues[i];
            iss.path = iss.path ? [${k}, ...iss.path] : [${k}];
            payload.issues.push(iss);
            if (iss.continue !== true) ${id}_ab = true;
          }
          if (${id}_ab && ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }`;
		doc.write(`const input = payload.value;`);
		const ids = Object.create(null);
		let counter = 0;
		for (const key of normalized.allKeys) ids[key] = `key_${counter++}`;
		doc.write(memo ? `const newResult = memo.alloc(inst, payload, {}, ctx);` : `const newResult = {};`);
		for (const key of normalized.allKeys) {
			if (key === "__proto__") continue;
			const id = ids[key];
			const k = typeof key === "symbol" ? `syms[${syms.indexOf(key)}]` : esc(key);
			const isPresent = `${k} in input`;
			const schema = shape[key];
			const optin = schema?._zod?.optin;
			const isOptionalIn = optin !== void 0;
			const isOptionalOut = schema?._zod?.optout === "optional";
			doc.write(`const ${id} = ${parseStr(k)};`);
			if (isOptionalIn && isOptionalOut) {
				const assign = optin === "optional" ? `${id}_present` : `${id}.value !== undefined || ${id}_present`;
				doc.write(`
        const ${id}_present = ${isPresent};
        if (!${id}.issues.length || ${id}_present) {
          if (${id}.issues.length) {${prefixStr(id, k)}
          }

          if (${assign}) {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
			} else if (!isOptionalIn) doc.write(`
        const ${id}_present = ${isPresent};
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
          if (ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }
        }

        if (${id}_present) {
          newResult[${k}] = ${id}.value;
        }

      `);
			else {
				doc.write(`
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
      `);
				if (optin === "defaulted") doc.write(`newResult[${k}] = ${id}.value;`);
				else doc.write(`
        if (${id}.value !== undefined || ${isPresent}) {
          newResult[${k}] = ${id}.value;
        }
      `);
			}
		}
		doc.write(`payload.value = newResult;`);
		doc.write(`return payload;`);
		return doc.compile();
	};
	let fastpass;
	const isObject$2 = isObject;
	const jit = !globalConfig.jitless;
	const fastEnabled = jit && allowsEval.value;
	const catchall = def.catchall;
	let value;
	inst._zod.parse = (payload, ctx) => {
		value ?? (value = _normalized.value);
		const input = payload.value;
		if (!isObject$2(input)) {
			payload.issues.push({
				expected: "object",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
			if (!fastpass) fastpass = generateFastpass(def.shape);
			payload = fastpass(payload, ctx);
			if (!catchall) return payload;
			return handleCatchall([], input, payload, ctx, value, inst, ctx?.abortEarly === true);
		}
		return superParse(payload, ctx);
	};
});
function handleUnionResults(results, final, inst, ctx) {
	for (const result of results) if (result.issues.length === 0) {
		final.value = result.value;
		return final;
	}
	const nonaborted = results.filter((r) => !aborted(r));
	if (nonaborted.length === 1) {
		final.value = nonaborted[0].value;
		return nonaborted[0];
	}
	final.issues.push({
		code: "invalid_union",
		input: final.value,
		inst,
		errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
	});
	return final;
}
var $ZodUnion = /*@__PURE__*/ $constructor("$ZodUnion", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazyInternal(inst, "optin", (zod) => zod.def.options.some((o) => o._zod.optin === "defaulted") ? "defaulted" : zod.def.options.some((o) => o._zod.optin !== void 0) ? "optional" : void 0);
	defineLazyInternal(inst, "optout", (zod) => zod.def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
	defineLazyInternal(inst, "values", (zod) => {
		if (zod.def.options.every((o) => o._zod.values)) return new Set(zod.def.options.flatMap((option) => Array.from(option._zod.values)));
	});
	defineLazyInternal(inst, "pattern", (zod) => {
		if (zod.def.options.every((o) => o._zod.pattern)) {
			const patterns = zod.def.options.map((o) => o._zod.pattern);
			return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
		}
	});
	const first = def.options.length === 1 ? def.options[0]._zod.run : null;
	inst._zod.parse = (payload, ctx) => {
		if (first) return first(payload, ctx);
		let async = false;
		const results = [];
		for (const option of def.options) {
			const result = option._zod.run({
				value: payload.value,
				issues: []
			}, ctx);
			if (result instanceof Promise) {
				results.push(result);
				async = true;
			} else {
				if (result.issues.length === 0) return result;
				results.push(result);
			}
		}
		if (!async) return handleUnionResults(results, payload, inst, ctx);
		return Promise.all(results).then((results) => {
			return handleUnionResults(results, payload, inst, ctx);
		});
	};
});
function discriminatorMap(def) {
	const map = /* @__PURE__ */ new Map();
	for (const option of def.options) {
		const values = option._zod.propValues?.[def.discriminator];
		if (!values || values.size === 0) throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
		for (const value of values) if (map.has(value)) {
			if (value !== void 0) throw new Error(`Duplicate discriminator value "${String(value)}"`);
			map.set(value, null);
		} else map.set(value, option);
	}
	return map;
}
var $ZodDiscriminatedUnion = /*@__PURE__*/ $constructor("$ZodDiscriminatedUnion", (inst, def) => {
	def.inclusive = false;
	$ZodUnion.init(inst, def);
	const _super = inst._zod.parse;
	defineLazyInternal(inst, "propValues", (zod) => {
		const propValues = {};
		let undefinedCount = 0;
		for (const option of zod.def.options) {
			const pv = option._zod.propValues;
			if (!pv || Object.keys(pv).length === 0) throw new Error(`Invalid discriminated union option at index "${zod.def.options.indexOf(option)}"`);
			if (pv[zod.def.discriminator]?.has(void 0)) undefinedCount++;
			for (const [k, v] of Object.entries(pv)) {
				if (!Object.prototype.hasOwnProperty.call(propValues, k)) assignProp(propValues, k, /* @__PURE__ */ new Set());
				for (const val of v) propValues[k].add(val);
			}
		}
		if (!zod.def.unionFallback && undefinedCount > 1) propValues[zod.def.discriminator]?.delete(void 0);
		return propValues;
	});
	def.options.forEach((option, i) => {
		const propShape = rawShape(option._zod.def);
		if (propShape && !Object.prototype.hasOwnProperty.call(propShape, def.discriminator)) throw new Error(`Invalid discriminated union option at index "${i}"`);
	});
	const disc = cached(() => discriminatorMap(def));
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		if (!isObject(input)) {
			payload.issues.push({
				code: "invalid_type",
				expected: "object",
				input,
				inst
			});
			return payload;
		}
		const value = input?.[def.discriminator];
		const opt = disc.value.get(value);
		if (opt && (value !== void 0 || ctx.direction !== "backward")) return opt._zod.run(payload, ctx);
		if (def.unionFallback || ctx.direction === "backward") return _super(payload, ctx);
		payload.issues.push({
			code: "invalid_union",
			errors: [],
			note: "No matching discriminator",
			discriminator: def.discriminator,
			options: Array.from(disc.value.keys()).filter((value) => disc.value.get(value) !== null),
			input,
			path: [def.discriminator],
			inst
		});
		return payload;
	};
});
var $ZodIntersection = /*@__PURE__*/ $constructor("$ZodIntersection", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		const left = def.left._zod.run({
			value: input,
			issues: []
		}, ctx);
		const right = def.right._zod.run({
			value: input,
			issues: []
		}, ctx);
		if (left instanceof Promise || right instanceof Promise) return Promise.all([left, right]).then(([left, right]) => {
			return handleIntersectionResults(payload, left, right);
		});
		return handleIntersectionResults(payload, left, right);
	};
});
function mergeValues(a, b) {
	if (a === b) return {
		valid: true,
		data: a
	};
	if (a instanceof Date && b instanceof Date && +a === +b) return {
		valid: true,
		data: a
	};
	if (isPlainObject(a) && isPlainObject(b)) {
		const bKeys = Object.keys(b);
		const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
		const newObj = {
			...a,
			...b
		};
		if (Object.prototype.hasOwnProperty.call(newObj, "__proto__")) delete newObj.__proto__;
		for (const key of sharedKeys) {
			if (key === "__proto__") continue;
			const sharedValue = mergeValues(a[key], b[key]);
			if (!sharedValue.valid) return {
				valid: false,
				mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
			};
			newObj[key] = sharedValue.data;
		}
		return {
			valid: true,
			data: newObj
		};
	}
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return {
			valid: false,
			mergeErrorPath: []
		};
		const newArray = [];
		for (let index = 0; index < a.length; index++) {
			const itemA = a[index];
			const itemB = b[index];
			const sharedValue = mergeValues(itemA, itemB);
			if (!sharedValue.valid) return {
				valid: false,
				mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
			};
			newArray.push(sharedValue.data);
		}
		return {
			valid: true,
			data: newArray
		};
	}
	return {
		valid: false,
		mergeErrorPath: []
	};
}
function handleIntersectionResults(result, left, right) {
	const unrecKeys = /* @__PURE__ */ new Map();
	let unrecIssue;
	const keyIssues = /* @__PURE__ */ new Map();
	const collect = (iss, side) => {
		let keys;
		if (iss.code === "unrecognized_keys" && !iss.path?.length) {
			unrecIssue ?? (unrecIssue = iss);
			keys = iss.keys;
		} else if (iss.code === "invalid_key" && iss.origin === "record" && iss.path?.length === 1) {
			const k = String(iss.path[0]);
			if (!keyIssues.has(k)) keyIssues.set(k, iss);
			keys = [k];
		} else return false;
		for (const k of keys) {
			if (!unrecKeys.has(k)) unrecKeys.set(k, {});
			unrecKeys.get(k)[side] = true;
		}
		return true;
	};
	for (const iss of left.issues) if (!collect(iss, "l")) result.issues.push(iss);
	for (const iss of right.issues) if (!collect(iss, "r")) result.issues.push(iss);
	const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
	if (bothKeys.length) {
		const aggregated = unrecIssue ? bothKeys.filter((k) => unrecIssue.keys.includes(k)) : [];
		if (aggregated.length) result.issues.push({
			...unrecIssue,
			keys: aggregated
		});
		for (const k of bothKeys) if (!aggregated.includes(k) && keyIssues.has(k)) result.issues.push(keyIssues.get(k));
	}
	const merged = mergeValues(left.value, right.value);
	if (!merged.valid) {
		if (aborted(result)) return result;
		throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
	}
	result.value = merged.data;
	return result;
}
var $ZodRecord = /*@__PURE__*/ $constructor("$ZodRecord", (inst, def) => {
	$ZodType.init(inst, def);
	const memo = globalConfig.memoizer;
	memo?.attach(inst);
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		if (!isPlainObject(input)) {
			payload.issues.push({
				expected: "record",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		const proms = [];
		const values = def.keyType._zod.values;
		if (values && !def.partial) {
			payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
			const recordKeys = /* @__PURE__ */ new Set();
			for (const key of values) if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
				recordKeys.add(typeof key === "number" ? key.toString() : key);
				if (key === "__proto__") continue;
				const keyResult = def.keyType._zod.run({
					value: key,
					issues: []
				}, ctx);
				if (keyResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
				if (keyResult.issues.length) {
					payload.issues.push({
						code: "invalid_key",
						origin: "record",
						issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
						input: key,
						path: [key],
						inst
					});
					continue;
				}
				const outKey = keyResult.value;
				if (outKey === "__proto__") continue;
				const result = def.valueType._zod.run({
					value: input[key],
					issues: []
				}, ctx);
				if (result instanceof Promise) proms.push(result.then((result) => {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[outKey] = result.value;
				}));
				else {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[outKey] = result.value;
				}
			}
			let unrecognized;
			for (const key in input) if (!recordKeys.has(key)) {
				if (def.mode === "loose") {
					if (key === "__proto__") continue;
					payload.value[key] = input[key];
				} else {
					unrecognized = unrecognized ?? [];
					unrecognized.push(key);
				}
			}
			if (unrecognized && unrecognized.length > 0) payload.issues.push({
				code: "unrecognized_keys",
				input,
				inst,
				keys: unrecognized,
				continue: true
			});
		} else {
			payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
			let unrecognized;
			for (const key of Reflect.ownKeys(input)) {
				if (key === "__proto__") continue;
				if (!Object.prototype.propertyIsEnumerable.call(input, key)) continue;
				let keyResult = def.keyType._zod.run({
					value: key,
					issues: []
				}, ctx);
				if (keyResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
				if (typeof key === "string" && number$1.test(key) && keyResult.issues.length) {
					const retryResult = def.keyType._zod.run({
						value: Number(key),
						issues: []
					}, ctx);
					if (retryResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
					if (retryResult.issues.length === 0) keyResult = retryResult;
				}
				if (keyResult.issues.length) {
					if (def.mode === "loose") payload.value[key] = input[key];
					else if (values) {
						unrecognized = unrecognized ?? [];
						unrecognized.push(key);
					} else payload.issues.push({
						code: "invalid_key",
						origin: "record",
						issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
						input: key,
						path: [key],
						inst
					});
					continue;
				}
				const outKey = keyResult.value;
				if (outKey === "__proto__") continue;
				const result = def.valueType._zod.run({
					value: input[key],
					issues: []
				}, ctx);
				if (result instanceof Promise) proms.push(result.then((result) => {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[outKey] = result.value;
				}));
				else {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[outKey] = result.value;
				}
			}
			if (unrecognized && unrecognized.length > 0) payload.issues.push({
				code: "unrecognized_keys",
				input,
				inst,
				keys: unrecognized,
				continue: true
			});
		}
		if (proms.length) return Promise.all(proms).then(() => payload);
		return payload;
	};
});
var $ZodEnum = /*@__PURE__*/ $constructor("$ZodEnum", (inst, def) => {
	$ZodType.init(inst, def);
	const values = getEnumValues(def.entries);
	const valuesSet = new Set(values);
	inst._zod.values = valuesSet;
	defineLazyInternal(inst, "pattern", (zod) => {
		const patternValues = getEnumValues(zod.def.entries).filter((k) => propertyKeyTypes.has(typeof k));
		return new RegExp(patternValues.length ? `^(${patternValues.map((o) => escapeRegex(o.toString())).join("|")})$` : "^[^\\s\\S]$");
	});
	inst._zod.parse = (payload, _ctx) => {
		const input = payload.value;
		if (valuesSet.has(input)) return payload;
		payload.issues.push({
			code: "invalid_value",
			values,
			input,
			inst
		});
		return payload;
	};
});
var $ZodLiteral = /*@__PURE__*/ $constructor("$ZodLiteral", (inst, def) => {
	$ZodType.init(inst, def);
	const values = new Set(def.values);
	inst._zod.values = values;
	defineLazyInternal(inst, "pattern", (zod) => {
		const vals = zod.def.values;
		return new RegExp(vals.length ? `^(${vals.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$` : "^[^\\s\\S]$");
	});
	inst._zod.parse = (payload, _ctx) => {
		const input = payload.value;
		if (values.has(input)) return payload;
		payload.issues.push({
			code: "invalid_value",
			values: def.values,
			input,
			inst
		});
		return payload;
	};
});
var $ZodTransform = /*@__PURE__*/ $constructor("$ZodTransform", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "optional";
	globalConfig.memoizer?.guard(inst);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
		const _out = def.transform(payload.value, payload);
		if (ctx.async) return (_out instanceof Promise ? _out : Promise.resolve(_out)).then((output) => {
			payload.value = output;
			return payload;
		});
		if (_out instanceof Promise) throw new $ZodAsyncError();
		payload.value = _out;
		return payload;
	};
});
function handleOptionalResult(payload, result) {
	payload.value = result.issues.length ? void 0 : result.value;
	return payload;
}
var $ZodOptional = /*@__PURE__*/ $constructor("$ZodOptional", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
	inst._zod.optout = "optional";
	defineLazyInternal(inst, "values", (zod) => {
		const values = zod.def.innerType._zod.values;
		return values ? /* @__PURE__ */ new Set([...values, void 0]) : void 0;
	});
	defineLazyInternal(inst, "pattern", (zod) => {
		const pattern = zod.def.innerType._zod.pattern;
		return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
	});
	inst._zod.parse = (payload, ctx) => {
		if (payload.value === void 0) {
			if (def.innerType._zod.optin !== "defaulted") return payload;
			const result = def.innerType._zod.run({
				value: payload.value,
				issues: []
			}, ctx);
			if (result instanceof Promise) return result.then((result) => handleOptionalResult(payload, result));
			return handleOptionalResult(payload, result);
		}
		return def.innerType._zod.run(payload, ctx);
	};
});
var $ZodExactOptional = /*@__PURE__*/ $constructor("$ZodExactOptional", (inst, def) => {
	$ZodOptional.init(inst, def);
	defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
	defineLazyInternal(inst, "pattern", (zod) => zod.def.innerType._zod.pattern);
	inst._zod.parse = (payload, ctx) => {
		return def.innerType._zod.run(payload, ctx);
	};
});
var $ZodNullable = /*@__PURE__*/ $constructor("$ZodNullable", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin);
	defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
	defineLazyInternal(inst, "pattern", (zod) => {
		const pattern = zod.def.innerType._zod.pattern;
		return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
	});
	defineLazyInternal(inst, "values", (zod) => {
		return zod.def.innerType._zod.values ? /* @__PURE__ */ new Set([...zod.def.innerType._zod.values, null]) : void 0;
	});
	inst._zod.parse = (payload, ctx) => {
		if (payload.value === null) return payload;
		return def.innerType._zod.run(payload, ctx);
	};
});
var $ZodDefault = /*@__PURE__*/ $constructor("$ZodDefault", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "defaulted";
	defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		if (payload.value === void 0) {
			payload.value = def.defaultValue;
			/**
			* $ZodDefault returns the default value immediately in forward direction.
			* It doesn't pass the default value into the validator ("prefault"). There's no reason to pass the default value through validation. The validity of the default is enforced by TypeScript statically. Otherwise, it's the responsibility of the user to ensure the default is valid. In the case of pipes with divergent in/out types, you can specify the default on the `in` schema of your ZodPipe to set a "prefault" for the pipe.   */
			return payload;
		}
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then((result) => handleDefaultResult(result, def));
		return handleDefaultResult(result, def);
	};
});
function handleDefaultResult(payload, def) {
	if (payload.value === void 0) payload.value = def.defaultValue;
	return payload;
}
var $ZodPrefault = /*@__PURE__*/ $constructor("$ZodPrefault", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "defaulted";
	defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		if (payload.value === void 0) payload.value = def.defaultValue;
		return def.innerType._zod.run(payload, ctx);
	};
});
var $ZodNonOptional = /*@__PURE__*/ $constructor("$ZodNonOptional", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazyInternal(inst, "values", (zod) => {
		const v = zod.def.innerType._zod.values;
		return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
	});
	inst._zod.parse = (payload, ctx) => {
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then((result) => handleNonOptionalResult(result, inst));
		return handleNonOptionalResult(result, inst);
	};
});
function handleNonOptionalResult(payload, inst) {
	if (!payload.issues.length && payload.value === void 0) payload.issues.push({
		code: "invalid_type",
		expected: "nonoptional",
		input: payload.value,
		inst
	});
	return payload;
}
function handleCatchResult(payload, result, def, ctx) {
	if (!result.issues.length) {
		payload.value = result.value;
		if (result.memo) payload.memo = true;
		return payload;
	}
	payload.value = def.catchValue({
		...result,
		value: payload.value,
		error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
		input: payload.value
	});
	return payload;
}
var $ZodCatch = /*@__PURE__*/ $constructor("$ZodCatch", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
	defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
	defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		const result = def.innerType._zod.run({
			value: payload.value,
			issues: []
		}, ctx);
		if (result instanceof Promise) return result.then((result) => handleCatchResult(payload, result, def, ctx));
		return handleCatchResult(payload, result, def, ctx);
	};
});
var $ZodPipe = /*@__PURE__*/ $constructor("$ZodPipe", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazyInternal(inst, "values", (zod) => zod.def.in._zod.values);
	defineLazyInternal(inst, "optin", (zod) => zod.def.in._zod.optin);
	defineLazyInternal(inst, "optout", (zod) => zod.def.out._zod.optout);
	defineLazyInternal(inst, "propValues", (zod) => zod.def.in._zod.propValues);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") {
			const right = def.out._zod.run(payload, ctx);
			if (right instanceof Promise) return right.then((right) => handlePipeResult(right, def.in, ctx));
			return handlePipeResult(right, def.in, ctx);
		}
		const left = def.in._zod.run(payload, ctx);
		if (left instanceof Promise) return left.then((left) => handlePipeResult(left, def.out, ctx));
		return handlePipeResult(left, def.out, ctx);
	};
});
function handlePipeResult(left, next, ctx) {
	if (left.issues.some((iss) => iss.code !== "unrecognized_keys")) {
		left.aborted = true;
		return left;
	}
	return next._zod.run({
		value: left.value,
		issues: left.issues
	}, ctx);
}
var $ZodReadonly = /*@__PURE__*/ $constructor("$ZodReadonly", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazyInternal(inst, "propValues", (zod) => zod.def.innerType._zod.propValues);
	defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
	defineLazyInternal(inst, "optin", (zod) => zod.def.innerType?._zod?.optin);
	defineLazyInternal(inst, "optout", (zod) => zod.def.innerType?._zod?.optout);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then(handleReadonlyResult);
		return handleReadonlyResult(result);
	};
});
function handleReadonlyResult(payload) {
	if (!payload.memo) payload.value = Object.freeze(payload.value);
	return payload;
}
var $ZodCustom = /*@__PURE__*/ $constructor("$ZodCustom", (inst, def) => {
	$ZodCheck.init(inst, def);
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, _) => {
		return payload;
	};
	inst._zod.check = (payload) => {
		const input = payload.value;
		const r = def.fn(input);
		if (r instanceof Promise) return r.then((r) => handleRefineResult(r, payload, input, inst));
		handleRefineResult(r, payload, input, inst);
	};
});
function handleRefineResult(result, payload, input, inst) {
	if (!result) {
		const _iss = {
			code: "custom",
			input,
			inst,
			path: [...inst._zod.def.path ?? []],
			continue: !inst._zod.def.abort
		};
		if (inst._zod.def.params) _iss.params = inst._zod.def.params;
		payload.issues.push(issue$1(_iss));
	}
}
// node_modules/zod/v4/core/memoizer.js
var $ZodCyclicError = class extends Error {
	constructor() {
		super(`Cannot parse a reference cycle that closes through a transform`);
		this.name = "ZodCyclicError";
	}
};
/** Keyed off the context object every schema in one parse call already shares. */
var STATE = "~memo";
var NO_ISSUES = [];
function isRef(value) {
	return value !== null && typeof value === "object";
}
function cloneIssues(issues) {
	return issues.map((iss) => iss.path ? {
		...iss,
		path: iss.path.slice()
	} : { ...iss });
}
var recursive = /*@__PURE__*/ new WeakMap();
/** What the walk established, in order of certainty: ordered so the strongest answer among children wins. */
var NONE = 0;
var ASSUMED = 1;
var PROVEN = 2;
/** Whether this schema's subtree contains a cycle, so one parse can re-enter it. */
function isRecursive(inst, stack, resolve) {
	const cached = recursive.get(inst);
	if (cached !== void 0) return cached ? PROVEN : NONE;
	if (stack.has(inst)) return PROVEN;
	stack.add(inst);
	let result = NONE;
	const check = (child) => {
		if (result !== PROVEN && child?._zod) {
			const answer = isRecursive(child, stack, resolve);
			if (answer > result) result = answer;
		}
	};
	const shape = (sh, spread) => {
		let answer = NONE;
		for (const key of Reflect.ownKeys(sh)) {
			const desc = Object.getOwnPropertyDescriptor(sh, key);
			if (spread && !desc.enumerable) continue;
			const child = desc.get ? ASSUMED : desc.value?._zod ? isRecursive(desc.value, stack, resolve) : NONE;
			if (child > answer) answer = child;
		}
		return answer;
	};
	const merge = (answer) => {
		if (answer > result) result = answer;
	};
	const def = inst._zod.def;
	switch (def.type) {
		case "object": {
			const raw = rawShape(def);
			merge(raw ? shape(raw, true) : ASSUMED);
			check(def.catchall);
			break;
		}
		case "array":
			check(def.element);
			break;
		case "tuple":
			for (const el of def.items) check(el);
			check(def.rest);
			break;
		case "record":
		case "map":
			check(def.keyType);
			check(def.valueType);
			break;
		case "set":
			check(def.valueType);
			break;
		case "union":
			for (const el of def.options) check(el);
			break;
		case "intersection":
			check(def.left);
			check(def.right);
			break;
		case "optional":
		case "nullable":
		case "default":
		case "prefault":
		case "catch":
		case "readonly":
		case "nonoptional":
		case "promise":
		case "success":
			check(def.innerType);
			break;
		case "pipe":
			check(def.in);
			check(def.out);
			break;
		case "function":
			check(def.input);
			check(def.output);
			break;
		case "lazy": {
			const inner = def._cachedInner ?? (resolve ? inst._zod.innerType : void 0);
			merge(inner ? isRecursive(inner, stack, false) : ASSUMED);
			break;
		}
		case "template_literal":
		case "string":
		case "number":
		case "int":
		case "boolean":
		case "bigint":
		case "symbol":
		case "undefined":
		case "null":
		case "void":
		case "never":
		case "any":
		case "unknown":
		case "date":
		case "nan":
		case "enum":
		case "literal":
		case "file":
		case "transform":
		case "custom": break;
		default: for (const key in def) {
			const desc = Object.getOwnPropertyDescriptor(def, key);
			if (!desc || desc.get) continue;
			const value = desc.value;
			if (!value || typeof value !== "object") continue;
			if (value._zod) check(value);
			else if (Array.isArray(value)) for (const el of value) check(el);
		}
	}
	stack.delete(inst);
	return settle(inst, result);
}
/** An assumed answer must not outlive the resolution that settles it, so only a certain one is cached. */
function settle(inst, answer) {
	if (answer !== ASSUMED) recursive.set(inst, answer === PROVEN);
	return answer;
}
function bucketFor(state, inst) {
	let bucket = state.buckets.get(inst);
	if (!bucket) {
		bucket = /* @__PURE__ */ new WeakMap();
		state.buckets.set(inst, bucket);
	}
	return bucket;
}
var handoff;
var open = [];
var memo = {
	alloc(_inst, payload, empty) {
		const bucket = handoff;
		if (!bucket) return empty;
		handoff = void 0;
		const entry = {
			value: empty,
			issues: null
		};
		bucket.set(payload.value, entry);
		open.push(entry);
		return empty;
	},
	guard(inst) {
		var _a;
		(_a = inst._zod).deferred ?? (_a.deferred = []);
		inst._zod.deferred.push(() => {
			const base = inst._zod.parse;
			const wrapped = (payload, ctx) => {
				if (ctx.direction !== "backward" && isBackEdge(ctx, payload.value)) throw new $ZodCyclicError();
				return base(payload, ctx);
			};
			inst._zod.parse = wrapped;
			if (inst._zod.run === base) inst._zod.run = wrapped;
		});
	},
	attach(inst) {
		var _a;
		let isRecursiveInst;
		let rechecked = false;
		let lastCtx;
		let lastBucket;
		(_a = inst._zod).deferred ?? (_a.deferred = []);
		inst._zod.deferred.push(() => {
			const base = inst._zod.parse;
			const wrapped = (payload, ctx) => {
				if (isRecursiveInst === void 0) {
					const walked = isRecursive(inst, /* @__PURE__ */ new Set(), false);
					if (walked === NONE) {
						inst._zod.parse = base;
						if (inst._zod.run === wrapped) inst._zod.run = base;
						return base(payload, ctx);
					}
					if (walked === PROVEN || rechecked) isRecursiveInst = true;
					else rechecked = true;
				}
				const input = payload.value;
				if (!isRef(input)) return base(payload, ctx);
				let state = ctx[STATE];
				if (!state) {
					state = {
						buckets: /* @__PURE__ */ new WeakMap(),
						backEdges: void 0
					};
					ctx[STATE] = state;
				}
				let bucket;
				if (lastCtx === ctx) bucket = lastBucket;
				else {
					bucket = bucketFor(state, inst);
					lastCtx = ctx;
					lastBucket = bucket;
				}
				const hit = bucket.get(input);
				if (hit) {
					payload.value = hit.value;
					if (hit.issues) {
						if (hit.issues.length) payload.issues.push(...cloneIssues(hit.issues));
					} else {
						payload.memo = true;
						state.backEdges ?? (state.backEdges = /* @__PURE__ */ new WeakSet());
						state.backEdges.add(hit.value);
					}
					return payload;
				}
				handoff = bucket;
				const depth = open.length;
				const result = base(payload, ctx);
				handoff = void 0;
				const entry = open.length > depth ? open.pop() : void 0;
				if (result instanceof Promise) return result.then((r) => {
					if (entry) entry.issues = r.issues.length ? cloneIssues(r.issues) : NO_ISSUES;
					return r;
				});
				if (entry) entry.issues = result.issues.length ? cloneIssues(result.issues) : NO_ISSUES;
				return result;
			};
			inst._zod.parse = wrapped;
			if (inst._zod.run === base) inst._zod.run = wrapped;
		});
	}
};
/** The memoizer that gives containers cycle support. `zod` installs it by default; `zod/mini` opts in with `config({ memoizer: memoizer() })`. */
function memoizer() {
	return memo;
}
/** Whether this value is a node a back-edge resolved to before it finished. */
function isBackEdge(ctx, value) {
	const backEdges = ctx[STATE]?.backEdges;
	return backEdges !== void 0 && isRef(value) && backEdges.has(value);
}
// node_modules/zod/v4/locales/en.js
var error = () => {
	const Sizable = {
		string: {
			unit: "characters",
			verb: "to have"
		},
		file: {
			unit: "bytes",
			verb: "to have"
		},
		array: {
			unit: "items",
			verb: "to have"
		},
		set: {
			unit: "items",
			verb: "to have"
		},
		map: {
			unit: "entries",
			verb: "to have"
		}
	};
	function getSizing(origin) {
		return Sizable[origin] ?? null;
	}
	const FormatDictionary = {
		regex: "input",
		email: "email address",
		url: "URL",
		emoji: "emoji",
		uuid: "UUID",
		uuidv4: "UUIDv4",
		uuidv6: "UUIDv6",
		nanoid: "nanoid",
		guid: "GUID",
		cuid: "cuid",
		cuid2: "cuid2",
		ulid: "ULID",
		xid: "XID",
		ksuid: "KSUID",
		datetime: "ISO datetime",
		date: "ISO date",
		time: "ISO time",
		duration: "ISO duration",
		ipv4: "IPv4 address",
		ipv6: "IPv6 address",
		mac: "MAC address",
		cidrv4: "IPv4 range",
		cidrv6: "IPv6 range",
		base64: "base64-encoded string",
		base64url: "base64url-encoded string",
		json_string: "JSON string",
		e164: "E.164 number",
		currency_code: "currency code",
		credit_card: "credit card number",
		iban: "IBAN",
		jwt: "JWT",
		template_literal: "input"
	};
	const TypeDictionary = { nan: "NaN" };
	function getTypeName(type, input) {
		if (type === "number" && typeof input === "number" && !Number.isFinite(input)) return String(input);
		return TypeDictionary[type] ?? type;
	}
	return (issue) => {
		switch (issue.code) {
			case "invalid_type": return `Invalid input: expected ${getTypeName(issue.expected)}, received ${getTypeName(parsedType(issue.input), issue.input)}`;
			case "invalid_value":
				if (issue.values.length === 1) return `Invalid input: expected ${stringifyPrimitive(issue.values[0])}`;
				return `Invalid option: expected one of ${joinValues(issue.values, "|")}`;
			case "too_big": {
				const adj = issue.exact ? "exactly " : issue.inclusive ? "<=" : "<";
				const sizing = getSizing(issue.origin);
				if (sizing) return `Too big: expected ${issue.origin ?? "value"} to have ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elements"}`;
				return `Too big: expected ${issue.origin ?? "value"} to be ${adj}${issue.maximum.toString()}`;
			}
			case "too_small": {
				const adj = issue.exact ? "exactly " : issue.inclusive ? ">=" : ">";
				const sizing = getSizing(issue.origin);
				if (sizing) return `Too small: expected ${issue.origin} to have ${adj}${issue.minimum.toString()} ${sizing.unit}`;
				return `Too small: expected ${issue.origin} to be ${adj}${issue.minimum.toString()}`;
			}
			case "invalid_format": {
				const _issue = issue;
				if (_issue.format === "starts_with") return `Invalid string: must start with "${_issue.prefix}"`;
				if (_issue.format === "ends_with") return `Invalid string: must end with "${_issue.suffix}"`;
				if (_issue.format === "includes") return `Invalid string: must include "${_issue.includes}"`;
				if (_issue.format === "regex") return `Invalid string: must match pattern ${_issue.pattern}`;
				return `Invalid ${FormatDictionary[_issue.format] ?? issue.format}`;
			}
			case "not_multiple_of": return `Invalid number: must be a multiple of ${issue.divisor}`;
			case "unrecognized_keys": return `Unrecognized key${issue.keys.length > 1 ? "s" : ""}: ${joinValues(issue.keys, ", ")}`;
			case "invalid_key": return `Invalid key in ${issue.origin}`;
			case "invalid_union":
				if (issue.options && Array.isArray(issue.options) && issue.options.length > 0) return `Invalid discriminator value. Expected ${issue.options.map((o) => `'${o}'`).join(" | ")}`;
				if (issue.inclusive === false) return "Invalid input: more than one option matched";
				return "Invalid input";
			case "invalid_element": return `Invalid value in ${issue.origin}`;
			default: return `Invalid input`;
		}
	};
};
function en_default() {
	return { localeError: error() };
}
// node_modules/zod/v4/core/registries.js
var _a;
var $ZodRegistry = class {
	constructor() {
		this._map = /* @__PURE__ */ new WeakMap();
		this._idmap = /* @__PURE__ */ new Map();
	}
	add(schema, ..._meta) {
		const meta = _meta[0];
		this._map.set(schema, meta);
		if (meta && typeof meta === "object" && "id" in meta) this._idmap.set(meta.id, schema);
		return this;
	}
	clear() {
		this._map = /* @__PURE__ */ new WeakMap();
		this._idmap = /* @__PURE__ */ new Map();
		return this;
	}
	remove(schema) {
		const meta = this._map.get(schema);
		if (meta && typeof meta === "object" && "id" in meta) this._idmap.delete(meta.id);
		this._map.delete(schema);
		return this;
	}
	get(schema) {
		const p = schema._zod.parent;
		if (p) {
			const pm = { ...this.get(p) ?? {} };
			delete pm.id;
			const f = {
				...pm,
				...this._map.get(schema)
			};
			return Object.keys(f).length ? f : void 0;
		}
		return this._map.get(schema);
	}
	has(schema) {
		return this._map.has(schema);
	}
};
function registry() {
	return new $ZodRegistry();
}
(_a = globalThis).__zod_globalRegistry ?? (_a.__zod_globalRegistry = registry());
var globalRegistry = globalThis.__zod_globalRegistry;
// node_modules/zod/v4/core/api.js
function snapshotChecks(def) {
	if (def.checks) def.checks = [...def.checks];
	return def;
}
// @__NO_SIDE_EFFECTS__
function _string(Class, params) {
	return new Class(snapshotChecks({
		type: "string",
		...normalizeParams(params)
	}));
}
// @__NO_SIDE_EFFECTS__
function _email(Class, params) {
	return new Class({
		type: "string",
		format: "email",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _guid(Class, params) {
	return new Class({
		type: "string",
		format: "guid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuid(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuidv4(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		version: "v4",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuidv6(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		version: "v6",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuidv7(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		version: "v7",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _url(Class, params) {
	return new Class({
		type: "string",
		format: "url",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _emoji(Class, params) {
	return new Class({
		type: "string",
		format: "emoji",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _nanoid(Class, params) {
	return new Class({
		type: "string",
		format: "nanoid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link _cuid2} instead.
* See https://github.com/paralleldrive/cuid.
*/
// @__NO_SIDE_EFFECTS__
function _cuid(Class, params) {
	return new Class({
		type: "string",
		format: "cuid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _cuid2(Class, params) {
	return new Class({
		type: "string",
		format: "cuid2",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ulid(Class, params) {
	return new Class({
		type: "string",
		format: "ulid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _xid(Class, params) {
	return new Class({
		type: "string",
		format: "xid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ksuid(Class, params) {
	return new Class({
		type: "string",
		format: "ksuid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ipv4(Class, params) {
	return new Class({
		type: "string",
		format: "ipv4",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ipv6(Class, params) {
	return new Class({
		type: "string",
		format: "ipv6",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _cidrv4(Class, params) {
	return new Class({
		type: "string",
		format: "cidrv4",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _cidrv6(Class, params) {
	return new Class({
		type: "string",
		format: "cidrv6",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _base64(Class, params) {
	return new Class({
		type: "string",
		format: "base64",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _base64url(Class, params) {
	return new Class({
		type: "string",
		format: "base64url",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _e164(Class, params) {
	return new Class({
		type: "string",
		format: "e164",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _jwt(Class, params) {
	return new Class({
		type: "string",
		format: "jwt",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoDateTime(Class, params) {
	return new Class({
		type: "string",
		format: "datetime",
		check: "string_format",
		offset: false,
		local: false,
		precision: null,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoDate(Class, params) {
	return new Class({
		type: "string",
		format: "date",
		check: "string_format",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoTime(Class, params) {
	return new Class({
		type: "string",
		format: "time",
		check: "string_format",
		precision: null,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoDuration(Class, params) {
	return new Class({
		type: "string",
		format: "duration",
		check: "string_format",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _number(Class, params) {
	return new Class(snapshotChecks({
		type: "number",
		checks: [],
		...normalizeParams(params)
	}));
}
// @__NO_SIDE_EFFECTS__
function _int(Class, params) {
	return new Class({
		type: "number",
		check: "number_format",
		abort: false,
		format: "safeint",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _boolean(Class, params) {
	return new Class({
		type: "boolean",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _null$1(Class, params) {
	return new Class({
		type: "null",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _unknown(Class) {
	return new Class({ type: "unknown" });
}
// @__NO_SIDE_EFFECTS__
function _never(Class, params) {
	return new Class({
		type: "never",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _lt(value, params) {
	return new $ZodCheckLessThan({
		check: "less_than",
		...normalizeParams(params),
		value,
		inclusive: false
	});
}
// @__NO_SIDE_EFFECTS__
function _lte(value, params) {
	return new $ZodCheckLessThan({
		check: "less_than",
		...normalizeParams(params),
		value,
		inclusive: true
	});
}
// @__NO_SIDE_EFFECTS__
function _gt(value, params) {
	return new $ZodCheckGreaterThan({
		check: "greater_than",
		...normalizeParams(params),
		value,
		inclusive: false
	});
}
// @__NO_SIDE_EFFECTS__
function _gte(value, params) {
	return new $ZodCheckGreaterThan({
		check: "greater_than",
		...normalizeParams(params),
		value,
		inclusive: true
	});
}
// @__NO_SIDE_EFFECTS__
function _multipleOf(value, params) {
	return new $ZodCheckMultipleOf({
		check: "multiple_of",
		...normalizeParams(params),
		value
	});
}
// @__NO_SIDE_EFFECTS__
function _maxLength(maximum, params) {
	return new $ZodCheckMaxLength({
		check: "max_length",
		...normalizeParams(params),
		maximum
	});
}
// @__NO_SIDE_EFFECTS__
function _minLength(minimum, params) {
	return new $ZodCheckMinLength({
		check: "min_length",
		...normalizeParams(params),
		minimum
	});
}
// @__NO_SIDE_EFFECTS__
function _length(length, params) {
	return new $ZodCheckLengthEquals({
		check: "length_equals",
		...normalizeParams(params),
		length
	});
}
// @__NO_SIDE_EFFECTS__
function _regex(pattern, params) {
	return new $ZodCheckRegex({
		check: "string_format",
		format: "regex",
		...normalizeParams(params),
		pattern
	});
}
// @__NO_SIDE_EFFECTS__
function _lowercase(params) {
	return new $ZodCheckLowerCase({
		check: "string_format",
		format: "lowercase",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uppercase(params) {
	return new $ZodCheckUpperCase({
		check: "string_format",
		format: "uppercase",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _includes(includes, params) {
	return new $ZodCheckIncludes({
		check: "string_format",
		format: "includes",
		...normalizeParams(params),
		includes
	});
}
// @__NO_SIDE_EFFECTS__
function _startsWith(prefix, params) {
	return new $ZodCheckStartsWith({
		check: "string_format",
		format: "starts_with",
		...normalizeParams(params),
		prefix
	});
}
// @__NO_SIDE_EFFECTS__
function _endsWith(suffix, params) {
	return new $ZodCheckEndsWith({
		check: "string_format",
		format: "ends_with",
		...normalizeParams(params),
		suffix
	});
}
// @__NO_SIDE_EFFECTS__
function _overwrite(tx) {
	return new $ZodCheckOverwrite({
		check: "overwrite",
		tx
	});
}
// @__NO_SIDE_EFFECTS__
function _normalize(form) {
	return /* @__PURE__ */ _overwrite((input) => input.normalize(form));
}
// @__NO_SIDE_EFFECTS__
function _trim() {
	return /* @__PURE__ */ _overwrite((input) => input.trim());
}
// @__NO_SIDE_EFFECTS__
function _toLowerCase() {
	return /* @__PURE__ */ _overwrite((input) => input.toLowerCase());
}
// @__NO_SIDE_EFFECTS__
function _toUpperCase() {
	return /* @__PURE__ */ _overwrite((input) => input.toUpperCase());
}
// @__NO_SIDE_EFFECTS__
function _slugify() {
	return /* @__PURE__ */ _overwrite((input) => slugify(input));
}
// @__NO_SIDE_EFFECTS__
function _array(Class, element, params) {
	return new Class({
		type: "array",
		element,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _refine(Class, fn, _params) {
	return new Class({
		type: "custom",
		check: "custom",
		fn,
		...normalizeParams(_params)
	});
}
// @__NO_SIDE_EFFECTS__
function _superRefine(fn, params) {
	const ch = /* @__PURE__ */ _check((payload) => {
		payload.addIssue = (issue) => {
			if (typeof issue === "string") payload.issues.push(issue$1(issue, payload.value, ch._zod.def));
			else {
				const _issue = issue;
				if (_issue.fatal) _issue.continue = false;
				_issue.code ?? (_issue.code = "custom");
				if (!("input" in _issue)) _issue.input = payload.value;
				_issue.inst ?? (_issue.inst = ch);
				_issue.continue ?? (_issue.continue = !ch._zod.def.abort);
				payload.issues.push(issue$1(_issue));
			}
		};
		return fn(payload.value, payload);
	}, params);
	return ch;
}
// @__NO_SIDE_EFFECTS__
function _check(fn, params) {
	const ch = new $ZodCheck({
		check: "custom",
		...normalizeParams(params)
	});
	ch._zod.check = fn;
	return ch;
}
// node_modules/zod/v4/core/to-json-schema.js
function assignProps(target, ...sources) {
	for (const source of sources) for (const key of Reflect.ownKeys(source)) if (Object.prototype.propertyIsEnumerable.call(source, key)) assignProp(target, key, source[key]);
	return target;
}
function initializeContext(params) {
	let target = params?.target ?? "draft-2020-12";
	if (target === "draft-4") target = "draft-04";
	if (target === "draft-7") target = "draft-07";
	return {
		processors: params.processors ?? {},
		metadataRegistry: params?.metadata ?? globalRegistry,
		target,
		unrepresentable: params?.unrepresentable ?? "throw",
		override: params?.override ?? (() => {}),
		io: params?.io ?? "output",
		counter: 0,
		seen: /* @__PURE__ */ new Map(),
		sharedDefsExtractedFor: void 0,
		sharedEmitDoneFor: void 0,
		cycles: params?.cycles ?? "ref",
		reused: params?.reused ?? "inline",
		intersections: [],
		deferred: [],
		external: params?.external ?? void 0
	};
}
/**
* Applies the `unrepresentable` setting at a site that has no JSON Schema equivalent. Throws
* `message` unless the setting (or the handler's return value) says otherwise. Returns `true` if a
* custom JSON Schema was written into `json`, in which case the caller must not write its own.
*/
function handleUnrepresentable(schema, ctx, json, params, message) {
	const result = typeof ctx.unrepresentable === "function" ? ctx.unrepresentable({
		zodSchema: schema,
		path: params.path,
		message
	}) : ctx.unrepresentable;
	if (result === "any") return false;
	if (result === void 0 || result === "throw") throw new Error(message);
	Object.assign(json, result);
	return true;
}
function processSchema(schema, ctx, _params = {
	path: [],
	schemaPath: []
}) {
	var _a;
	const def = schema._zod.def;
	const seen = ctx.seen.get(schema);
	if (seen) {
		seen.count++;
		if (_params.schemaPath.includes(schema)) seen.cycle = _params.path;
		return seen.schema;
	}
	const result = {
		schema: {},
		count: 1,
		cycle: void 0,
		path: _params.path
	};
	ctx.seen.set(schema, result);
	ctx.sharedDefsExtractedFor = void 0;
	ctx.sharedEmitDoneFor = void 0;
	const overrideSchema = schema._zod.toJSONSchema?.();
	if (overrideSchema) result.schema = overrideSchema;
	else {
		const params = {
			..._params,
			schemaPath: [..._params.schemaPath, schema],
			path: _params.path
		};
		if (schema._zod.processJSONSchema) schema._zod.processJSONSchema(ctx, result.schema, params);
		else {
			const _json = result.schema;
			const processor = ctx.processors[def.type];
			if (!processor) throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
			processor(schema, ctx, _json, params);
		}
		const parent = schema._zod.parent;
		if (parent) {
			if (!result.ref) result.ref = parent;
			processSchema(parent, ctx, params);
			ctx.seen.get(parent).isParent = true;
		}
	}
	const meta = ctx.metadataRegistry.get(schema);
	if (meta) assignProps(result.schema, meta);
	if (ctx.io === "input" && isTransforming(schema)) {
		delete result.schema.examples;
		delete result.schema.default;
	}
	if (ctx.io === "input" && "_prefault" in result.schema) (_a = result.schema).default ?? (_a.default = result.schema._prefault);
	delete result.schema._prefault;
	return ctx.seen.get(schema).schema;
}
function encodeJSONPointerSegment(segment) {
	return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}
function extractDefs(ctx, schema) {
	const root = ctx.seen.get(schema);
	if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
	if (ctx.external && ctx.sharedDefsExtractedFor === ctx.external) return;
	const idToSchema = /* @__PURE__ */ new Map();
	for (const entry of ctx.seen.entries()) {
		const id = ctx.metadataRegistry.get(entry[0])?.id;
		if (id) {
			const existing = idToSchema.get(id);
			if (existing && existing !== entry[0]) throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
			idToSchema.set(id, entry[0]);
		}
	}
	const makeURI = (entry) => {
		const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
		if (ctx.external) {
			const externalId = ctx.external.registry.get(entry[0])?.id;
			const uriGenerator = ctx.external.uri ?? ((id) => id);
			if (externalId) return { ref: uriGenerator(externalId) };
			const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
			entry[1].defId = id;
			return {
				defId: id,
				ref: `${uriGenerator("__shared")}#/${defsSegment}/${encodeJSONPointerSegment(id)}`
			};
		}
		const uriPrefix = `#`;
		const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
		if (entry[1] === root && !entry[1].schema.id) return { ref: uriPrefix };
		const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
		return {
			defId,
			ref: defUriPrefix + encodeJSONPointerSegment(defId)
		};
	};
	const extractToDef = (entry) => {
		if (entry[1].schema.$ref) return;
		const seen = entry[1];
		const { ref, defId } = makeURI(entry);
		seen.def = { ...seen.schema };
		if (defId) seen.defId = defId;
		const schema = seen.schema;
		for (const key in schema) delete schema[key];
		schema.$ref = ref;
	};
	if (ctx.cycles === "throw") for (const entry of ctx.seen.entries()) {
		const seen = entry[1];
		if (seen.cycle) throw new Error(`Cycle detected: #/${seen.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
	}
	for (const entry of ctx.seen.entries()) {
		const seen = entry[1];
		if (schema === entry[0]) {
			extractToDef(entry);
			continue;
		}
		if (ctx.external) {
			const ext = ctx.external.registry.get(entry[0])?.id;
			if (schema !== entry[0] && ext) {
				extractToDef(entry);
				continue;
			}
		}
		if (ctx.metadataRegistry.get(entry[0])?.id) {
			extractToDef(entry);
			continue;
		}
		if (seen.cycle) {
			extractToDef(entry);
			continue;
		}
		if (seen.count > 1) {
			if (ctx.reused === "ref") extractToDef(entry);
		}
	}
	if (ctx.external) ctx.sharedDefsExtractedFor = ctx.external;
}
/** Rewrites `anyOf: [{type: "a"}, {type: "b"}]` to `type: ["a", "b"]`, which every JSON Schema draft treats as equivalent and most consumers render far better for the nullable case. Only branches that are a bare type assertion qualify — anything carrying a constraint, `$ref`, `const` or metadata is left alone. Runs after `flattenRef`, so a branch an override decorated or `$defs` extraction turned into a `$ref` is no longer bare and correctly stays in `anyOf`. `oneOf` is excluded: `integer` and `number` overlap, so "exactly one" and "at least one" are not the same there. OpenAPI 3.0 is excluded: its `type` must be a single string. */
function compactTypeUnion(schema) {
	const options = schema.anyOf;
	if (!Array.isArray(options) || options.length === 0 || schema.type !== void 0) return;
	const types = [];
	for (const option of options) {
		if (!option || typeof option !== "object") return;
		compactTypeUnion(option);
		const keys = Object.keys(option);
		if (keys.length !== 1 || keys[0] !== "type") return;
		const type = option.type;
		for (const member of Array.isArray(type) ? type : [type]) {
			if (typeof member !== "string") return;
			if (!types.includes(member)) types.push(member);
		}
	}
	delete schema.anyOf;
	schema.type = types.length === 1 ? types[0] : types;
}
/** Keywords `foldIntersection` knows how to combine. Anything else — `$ref`, `patternProperties`,
* an annotation like `description` — makes a member unfoldable, so a constraint this does not
* understand leaves the `allOf` alone instead of being silently dropped or misattributed. */
var FOLDABLE_KEYS = /* @__PURE__ */ new Set([
	"type",
	"properties",
	"required",
	"additionalProperties"
]);
var UNION_KEYS = ["oneOf", "anyOf"];
/** A member's constraint on a key it does not declare itself. A `catchall` states one; `false`, an absent `additionalProperties`, and the empty schema a loose object emits state nothing. */
function undeclaredConstraint(member) {
	const extra = member.additionalProperties;
	if (extra === void 0 || extra === false || typeof extra !== "object" || extra === null) return null;
	return Object.keys(extra).length ? extra : null;
}
/** Combines object members into the single object they describe together, or returns `null` if any of them carries a keyword outside {@link FOLDABLE_KEYS}. */
function foldObjects(members) {
	const objects = [];
	for (const member of members) {
		if (typeof member !== "object" || member.type !== "object") return null;
		for (const key in member) if (!FOLDABLE_KEYS.has(key)) return null;
		objects.push(member);
	}
	const properties = {};
	const required = /* @__PURE__ */ new Set();
	for (const object of objects) {
		for (const key in object.properties) {
			if (Object.prototype.hasOwnProperty.call(properties, key)) continue;
			const parts = [];
			for (const other of objects) {
				const part = other.properties?.[key] ?? undeclaredConstraint(other);
				if (part === null || part === void 0) continue;
				if (!parts.some((seen) => JSON.stringify(seen) === JSON.stringify(part))) parts.push(part);
			}
			assignProp(properties, key, parts.length === 1 ? parts[0] : foldObjects(parts) ?? { allOf: parts });
		}
		for (const key of object.required ?? []) required.add(key);
	}
	const folded = {
		type: "object",
		properties
	};
	if (required.size) folded.required = [...required];
	if (objects.every((object) => object.additionalProperties === false)) folded.additionalProperties = false;
	else {
		const constraints = [];
		for (const object of objects) {
			const constraint = undeclaredConstraint(object);
			if (constraint && !constraints.some((seen) => JSON.stringify(seen) === JSON.stringify(constraint))) constraints.push(constraint);
		}
		if (constraints.length === 1) folded.additionalProperties = constraints[0];
		else if (constraints.length > 1) folded.additionalProperties = { allOf: constraints };
	}
	return folded;
}
/** `additionalProperties` in an `allOf` member sees only that member's own `properties`, so two
* closed object members reject each other's keys and the schema validates nothing. Zod's parser
* pools the key sets instead — `handleIntersectionResults` reports a key as unrecognized only when
* *every* side rejects it — so the emitted schema has to pool them too, and folding the members
* into one object is the encoding that says so on every target.
*
* This runs from `finalize`, after `extractDefs`, which is what keeps it clear of the `$ref`
* machinery: a member extracted into `$defs` is already a `$ref` by now and declines to fold, so it
* keeps its reference and its own closedness rather than being inlined as a stale copy. */
function foldIntersection(json) {
	const allOf = json.allOf;
	if (!Array.isArray(allOf) || allOf.length < 2) return;
	for (const key of FOLDABLE_KEYS) if (key in json) return;
	const unions = allOf.filter((m) => UNION_KEYS.some((k) => Array.isArray(m[k])));
	let folded = null;
	if (!unions.length) folded = foldObjects(allOf);
	else {
		const union = unions[0];
		const keyword = UNION_KEYS.find((k) => Array.isArray(union[k]));
		if (Object.keys(union).length !== 1) return;
		const rest = allOf.filter((m) => m !== union);
		const branches = union[keyword].map((branch) => foldObjects([...rest, branch]));
		if (branches.some((b) => !b)) return;
		folded = { [keyword]: branches };
	}
	if (!folded) return;
	delete json.allOf;
	assignProps(json, folded);
}
function finalize(ctx, schema) {
	const root = ctx.seen.get(schema);
	if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
	const flattenRef = (zodSchema) => {
		const seen = ctx.seen.get(zodSchema);
		if (seen.ref === null) return;
		const schema = seen.def ?? seen.schema;
		const _cached = { ...schema };
		const ref = seen.ref;
		seen.ref = null;
		if (ref) {
			flattenRef(ref);
			const refSeen = ctx.seen.get(ref);
			const refSchema = refSeen.schema;
			if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
				schema.allOf = schema.allOf ?? [];
				schema.allOf.push(refSchema);
			} else assignProps(schema, refSchema);
			assignProps(schema, _cached);
			if (zodSchema._zod.parent === ref) for (const key in schema) {
				if (key === "$ref" || key === "allOf") continue;
				if (!(key in _cached)) delete schema[key];
			}
			if (refSchema.$ref && refSeen.def) for (const key in schema) {
				if (key === "$ref" || key === "allOf") continue;
				if (key in refSeen.def && JSON.stringify(schema[key]) === JSON.stringify(refSeen.def[key])) delete schema[key];
			}
		}
		const parent = zodSchema._zod.parent;
		if (parent && parent !== ref) {
			flattenRef(parent);
			const parentSeen = ctx.seen.get(parent);
			if (parentSeen?.schema.$ref) {
				schema.$ref = parentSeen.schema.$ref;
				if (parentSeen.def) for (const key in schema) {
					if (key === "$ref" || key === "allOf") continue;
					if (key in parentSeen.def && JSON.stringify(schema[key]) === JSON.stringify(parentSeen.def[key])) delete schema[key];
				}
			}
		}
		ctx.override({
			zodSchema,
			jsonSchema: schema,
			path: seen.path ?? []
		});
	};
	if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) {
		for (const entry of [...ctx.seen.entries()].reverse()) flattenRef(entry[0]);
		if (ctx.target !== "openapi-3.0") for (const entry of ctx.seen.entries()) compactTypeUnion(entry[1].def ?? entry[1].schema);
		for (const rewrite of ctx.deferred) rewrite();
		if (ctx.intersections.length) {
			const carriers = /* @__PURE__ */ new Map();
			for (const seen of ctx.seen.values()) for (const json of [seen.schema, seen.def]) {
				const allOf = json?.allOf;
				if (!Array.isArray(allOf)) continue;
				const existing = carriers.get(allOf);
				if (existing) existing.push(json);
				else carriers.set(allOf, [json]);
			}
			for (const allOf of ctx.intersections) for (const json of carriers.get(allOf) ?? []) foldIntersection(json);
		}
	}
	const result = {};
	if (ctx.target === "draft-2020-12") result.$schema = "https://json-schema.org/draft/2020-12/schema";
	else if (ctx.target === "draft-07") result.$schema = "http://json-schema.org/draft-07/schema#";
	else if (ctx.target === "draft-04") result.$schema = "http://json-schema.org/draft-04/schema#";
	else if (ctx.target === "openapi-3.0") {}
	if (ctx.external?.uri) {
		const id = ctx.external.registry.get(schema)?.id;
		if (!id) throw new Error("Schema is missing an `id` property");
		result.$id = ctx.external.uri(id);
	}
	assignProps(result, root.defId ? root.schema : root.def ?? root.schema);
	const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
	if (rootMetaId !== void 0 && result.id === rootMetaId) delete result.id;
	const defs = ctx.external?.defs ?? {};
	if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) for (const entry of ctx.seen.entries()) {
		const seen = entry[1];
		if (seen.def && seen.defId) {
			if (seen.def.id === seen.defId) delete seen.def.id;
			assignProp(defs, seen.defId, seen.def);
		}
	}
	if (ctx.external) ctx.sharedEmitDoneFor = ctx.external;
	if (ctx.external) {} else if (Object.keys(defs).length > 0) {
		if (ctx.target === "draft-2020-12") result.$defs = defs;
		else result.definitions = defs;
	}
	try {
		const finalized = JSON.parse(JSON.stringify(result));
		Object.defineProperty(finalized, "~standard", {
			value: {
				...schema["~standard"],
				jsonSchema: {
					input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
					output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
				}
			},
			enumerable: false,
			writable: false
		});
		return finalized;
	} catch (_err) {
		throw new Error("Error converting schema to JSON.");
	}
}
function isTransforming(_schema, _ctx) {
	const ctx = _ctx ?? { seen: /* @__PURE__ */ new Set() };
	if (ctx.seen.has(_schema)) return false;
	ctx.seen.add(_schema);
	const def = _schema._zod.def;
	if (def.type === "transform") return true;
	if (def.type === "array") return isTransforming(def.element, ctx);
	if (def.type === "set") return isTransforming(def.valueType, ctx);
	if (def.type === "lazy") return isTransforming(def.getter(), ctx);
	if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault" || def.type === "catch") return isTransforming(def.innerType, ctx);
	if (def.type === "intersection") return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
	if (def.type === "record" || def.type === "map") return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
	if (def.type === "pipe") {
		if (_schema._zod.traits.has("$ZodCodec")) return true;
		return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
	}
	if (def.type === "object") {
		for (const key in def.shape) if (isTransforming(def.shape[key], ctx)) return true;
		return false;
	}
	if (def.type === "union") {
		for (const option of def.options) if (isTransforming(option, ctx)) return true;
		return false;
	}
	if (def.type === "tuple") {
		for (const item of def.items) if (isTransforming(item, ctx)) return true;
		if (def.rest && isTransforming(def.rest, ctx)) return true;
		return false;
	}
	return false;
}
/**
* Creates a toJSONSchema method for a schema instance.
* This encapsulates the logic of initializing context, processing, extracting defs, and finalizing.
*/
var createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
	const ctx = initializeContext({
		...params,
		processors
	});
	processSchema(schema, ctx);
	extractDefs(ctx, schema);
	return finalize(ctx, schema);
};
var createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
	const { libraryOptions, target } = params ?? {};
	const ctx = initializeContext({
		...libraryOptions ?? {},
		target,
		io,
		processors
	});
	processSchema(schema, ctx);
	extractDefs(ctx, schema);
	return finalize(ctx, schema);
};
// node_modules/zod/v4/core/json-schema-processors.js
var narrowMin = (agg, key, value) => {
	if (agg[key] === void 0 || value > agg[key]) agg[key] = value;
};
var narrowMax = (agg, key, value) => {
	if (agg[key] === void 0 || value < agg[key]) agg[key] = value;
};
var narrowBoth = (agg, value) => {
	narrowMin(agg, "minimum", value);
	narrowMax(agg, "maximum", value);
};
var addDivisor = (agg, value) => {
	agg.multipleOf ?? (agg.multipleOf = []);
	if (!agg.multipleOf.includes(value)) agg.multipleOf.push(value);
};
var addPattern = (agg, pattern) => {
	agg.patterns ?? (agg.patterns = /* @__PURE__ */ new Set());
	agg.patterns.add(pattern);
};
var intersectMime = (agg, mime) => {
	agg.mime = agg.mime ? agg.mime.filter((m) => mime.includes(m)) : [...mime];
};
var setFormat = (agg, format) => {
	agg.format = format;
	if (format.includes("int")) agg.isInt = true;
};
var minContributor = (agg, def) => narrowMin(agg, "minimum", def.minimum);
var maxContributor = (agg, def) => narrowMax(agg, "maximum", def.maximum);
var formatContributor = (ranges) => (agg, def) => {
	setFormat(agg, def.format);
	const [minimum, maximum] = ranges[def.format];
	narrowMin(agg, "minimum", minimum);
	narrowMax(agg, "maximum", maximum);
};
var contributors = {
	greater_than: (agg, def) => narrowMin(agg, def.inclusive ? "minimum" : "exclusiveMinimum", def.value),
	less_than: (agg, def) => narrowMax(agg, def.inclusive ? "maximum" : "exclusiveMaximum", def.value),
	multiple_of: (agg, def) => addDivisor(agg, def.value),
	number_format: formatContributor(NUMBER_FORMAT_RANGES),
	bigint_format: formatContributor(BIGINT_FORMAT_RANGES),
	min_length: minContributor,
	max_length: maxContributor,
	length_equals: (agg, def) => narrowBoth(agg, def.length),
	min_size: minContributor,
	max_size: maxContributor,
	size_equals: (agg, def) => narrowBoth(agg, def.size),
	string_format: (agg, def) => {
		setFormat(agg, def.format);
		if (def.pattern) addPattern(agg, def.pattern);
		if (def.format === "base64" || def.format === "base64url") agg.contentEncoding = def.format;
		if (def.local || def.precision === -1) agg.laxFormat = true;
	},
	mime_type: (agg, def) => intersectMime(agg, def.mime)
};
function aggregateChecks(schema) {
	const agg = {};
	const def = schema._zod.def;
	const list = schema._zod.traits.has("$ZodCheck") ? [schema, ...def.checks ?? []] : def.checks ?? [];
	for (const ch of list) contributors[ch._zod.def.check]?.(agg, ch._zod.def);
	const bag = schema._zod.bag;
	if (bag.minimum !== void 0) narrowMin(agg, "minimum", bag.minimum);
	if (bag.exclusiveMinimum !== void 0) narrowMin(agg, "exclusiveMinimum", bag.exclusiveMinimum);
	if (bag.maximum !== void 0) narrowMax(agg, "maximum", bag.maximum);
	if (bag.exclusiveMaximum !== void 0) narrowMax(agg, "exclusiveMaximum", bag.exclusiveMaximum);
	if (bag.multipleOf !== void 0) addDivisor(agg, bag.multipleOf);
	if (bag.format !== void 0) {
		agg.format ?? (agg.format = bag.format);
		if (bag.format.includes("int")) agg.isInt = true;
	}
	if (bag.mime) intersectMime(agg, bag.mime);
	for (const pattern of bag.patterns ?? []) addPattern(agg, pattern);
	return agg;
}
var formatMap = {
	guid: "uuid",
	url: "uri",
	datetime: "date-time",
	json_string: "json-string",
	regex: ""
};
var exactPatterns = /* @__PURE__ */ new Map([[base64Charset, base64], [base64urlCharset, base64url]]);
var exactPattern = (p) => exactPatterns.get(p) ?? p;
var stringProcessor = (schema, ctx, _json, _params) => {
	const json = _json;
	json.type = "string";
	const { minimum, maximum, format, patterns, contentEncoding, laxFormat } = aggregateChecks(schema);
	if (typeof minimum === "number") json.minLength = minimum;
	if (typeof maximum === "number") json.maxLength = maximum;
	if (format) {
		json.format = formatMap[format] ?? format;
		if (json.format === "") delete json.format;
		if (format === "time" || laxFormat) delete json.format;
	}
	if (contentEncoding) json.contentEncoding = contentEncoding;
	if (patterns && patterns.size > 0) {
		const patternList = [...patterns].map(exactPattern);
		if (patternList.length === 1) json.pattern = patternList[0].source;
		else if (patternList.length > 1) json.allOf = [...patternList.map((regex) => ({
			...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
			pattern: regex.source
		}))];
	}
};
var numberProcessor = (schema, ctx, _json, params) => {
	const json = _json;
	const { minimum, maximum, multipleOf, exclusiveMaximum, exclusiveMinimum, isInt } = aggregateChecks(schema);
	json.type = isInt ? "integer" : "number";
	const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
	const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
	const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
	if (exMin) {
		if (legacy) {
			json.minimum = exclusiveMinimum;
			json.exclusiveMinimum = true;
		} else json.exclusiveMinimum = exclusiveMinimum;
	} else if (typeof minimum === "number") json.minimum = minimum;
	if (exMax) {
		if (legacy) {
			json.maximum = exclusiveMaximum;
			json.exclusiveMaximum = true;
		} else json.exclusiveMaximum = exclusiveMaximum;
	} else if (typeof maximum === "number") json.maximum = maximum;
	if (multipleOf) {
		const divisors = /* @__PURE__ */ new Set();
		for (const divisor of multipleOf) if (Number.isFinite(divisor) && divisor !== 0) divisors.add(Math.abs(divisor));
		else handleUnrepresentable(schema, ctx, json, params, `A multipleOf divisor of ${divisor} cannot be represented in JSON Schema`);
		const [first, ...rest] = divisors;
		if (first !== void 0) json.multipleOf = first;
		if (rest.length) json.allOf = [...json.allOf ?? [], ...rest.map((m) => ({ multipleOf: m }))];
	}
};
var booleanProcessor = (_schema, _ctx, json, _params) => {
	json.type = "boolean";
};
var nullProcessor = (_schema, ctx, json, _params) => {
	if (ctx.target === "openapi-3.0") {
		json.type = "string";
		json.nullable = true;
		json.enum = [null];
	} else json.type = "null";
};
var neverProcessor = (_schema, _ctx, json, _params) => {
	json.not = {};
};
var enumProcessor = (schema, _ctx, json, _params) => {
	const def = schema._zod.def;
	const values = getEnumValues(def.entries);
	if (values.length === 0) {
		json.not = {};
		return;
	}
	if (values.every((v) => typeof v === "number")) json.type = "number";
	if (values.every((v) => typeof v === "string")) json.type = "string";
	json.enum = values;
};
var literalProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	if (def.values.length === 0) {
		json.not = {};
		return;
	}
	const vals = [];
	for (const val of def.values) if (val === void 0) {
		if (handleUnrepresentable(schema, ctx, json, params, "Literal `undefined` cannot be represented in JSON Schema")) return;
	} else if (typeof val === "bigint") {
		if (handleUnrepresentable(schema, ctx, json, params, "BigInt literals cannot be represented in JSON Schema")) return;
		vals.push(Number(val));
	} else vals.push(val);
	if (vals.length === 0) {} else if (vals.length === 1) {
		const val = vals[0];
		json.type = val === null ? "null" : typeof val;
		if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") json.enum = [val];
		else json.const = val;
	} else {
		if (vals.every((v) => typeof v === "number")) json.type = "number";
		if (vals.every((v) => typeof v === "string")) json.type = "string";
		if (vals.every((v) => typeof v === "boolean")) json.type = "boolean";
		if (vals.every((v) => v === null)) json.type = "null";
		json.enum = vals;
	}
};
var customProcessor = (schema, ctx, json, params) => {
	handleUnrepresentable(schema, ctx, json, params, "Custom types cannot be represented in JSON Schema");
};
var transformProcessor = (schema, ctx, json, params) => {
	handleUnrepresentable(schema, ctx, json, params, "Transforms cannot be represented in JSON Schema");
};
var arrayProcessor = (schema, ctx, _json, params) => {
	const json = _json;
	const def = schema._zod.def;
	const { minimum, maximum } = aggregateChecks(schema);
	if (typeof minimum === "number") json.minItems = minimum;
	if (typeof maximum === "number") json.maxItems = maximum;
	json.type = "array";
	json.items = processSchema(def.element, ctx, {
		...params,
		path: [...params.path, "items"]
	});
};
function inputOptin(schema) {
	const def = schema._zod.def;
	if (def.type === "pipe" && def.in._zod.traits.has("$ZodTransform")) return inputOptin(def.out);
	if (def.type === "catch") return inputOptin(def.innerType);
	return schema._zod.optin;
}
var objectProcessor = (schema, ctx, _json, params) => {
	const json = _json;
	const def = schema._zod.def;
	const shape = def.shape;
	if (Object.getOwnPropertySymbols(shape).length && handleUnrepresentable(schema, ctx, json, params, "Symbol keys cannot be represented in JSON Schema")) return;
	json.type = "object";
	json.properties = {};
	for (const key in shape) assignProp(json.properties, key, processSchema(shape[key], ctx, {
		...params,
		path: [
			...params.path,
			"properties",
			key
		]
	}));
	const requiredKeys = [];
	for (const key of Object.keys(shape)) {
		const field = def.shape[key];
		if (ctx.io === "input" ? inputOptin(field) === void 0 : field._zod.optout === void 0) requiredKeys.push(key);
	}
	if (requiredKeys.length > 0) json.required = requiredKeys;
	if (def.catchall?._zod.def.type === "never") json.additionalProperties = false;
	else if (!def.catchall) {
		if (ctx.io === "output") json.additionalProperties = false;
	} else if (def.catchall) json.additionalProperties = processSchema(def.catchall, ctx, {
		...params,
		path: [...params.path, "additionalProperties"]
	});
};
var unionProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	const isExclusive = def.inclusive === false;
	const options = def.options.map((x, i) => processSchema(x, ctx, {
		...params,
		path: [
			...params.path,
			isExclusive ? "oneOf" : "anyOf",
			i
		]
	}));
	if (isExclusive) json.oneOf = options;
	else json.anyOf = options;
};
var intersectionProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	const a = processSchema(def.left, ctx, {
		...params,
		path: [
			...params.path,
			"allOf",
			0
		]
	});
	const b = processSchema(def.right, ctx, {
		...params,
		path: [
			...params.path,
			"allOf",
			1
		]
	});
	const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
	const allOf = [...isSimpleIntersection(a) ? a.allOf : [a], ...isSimpleIntersection(b) ? b.allOf : [b]];
	json.allOf = allOf;
	ctx.intersections.push(allOf);
};
/** JSON object keys are always strings, so a numeric record key schema is re-expressed over the
* numeric-string form the record parser matches. Deferred to `finalize`, after the flatten: a key
* behind a wrapper only carries its own `type` before then, and a union key only has its branches.
*
* A numeric bound cannot apply to a property name, so `minimum` and its siblings are dropped rather
* than carried over: keeping them beside `type: "string"` reproduces the match-nothing schema this
* exists to fix. A key that carries one therefore emits wider than the record parses — `z.record(z.number().min(5), V)`
* accepts `"3"` — which is the deliberate trade, since throwing on it would reject an ordinary schema
* outright. */
function stringifyKeyNames(bySchema, json, visited) {
	if (json.$ref) {
		if (visited.has(json)) return json;
		visited.add(json);
		const def = bySchema.get(json)?.def;
		if (!def) return json;
		const inlined = stringifyKeyNames(bySchema, def, visited);
		return inlined === def ? json : inlined;
	}
	for (const keyword of ["anyOf", "oneOf"]) {
		const branches = json[keyword];
		if (!Array.isArray(branches)) continue;
		const mapped = branches.map((branch) => stringifyKeyNames(bySchema, branch, visited));
		if (mapped.some((branch, i) => branch !== branches[i])) json = {
			...json,
			[keyword]: mapped
		};
	}
	const types = Array.isArray(json.type) ? json.type : [json.type];
	const numericType = !types.includes("string") && types.some((t) => t === "number" || t === "integer");
	const values = json.enum ?? (json.const !== void 0 ? [json.const] : void 0);
	if (!numericType && !values?.some((v) => typeof v === "number")) return json;
	const { minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf, format, id, ...rest } = json;
	if (rest.enum) rest.enum = rest.enum.map((v) => typeof v === "number" ? String(v) : v);
	else if (typeof rest.const === "number") rest.const = String(rest.const);
	if (!numericType) return rest;
	rest.type = "string";
	if (!values) rest.pattern = (types.includes("number") ? number$1 : integer).source;
	return rest;
}
/** Every record of one conversion, so the carriers are found in a single pass rather than once per record. */
var pendingRecords = /* @__PURE__ */ new WeakMap();
function rewriteKeyNames(ctx) {
	const bySchema = /* @__PURE__ */ new Map();
	for (const entry of ctx.seen.values()) if (entry.def && !bySchema.has(entry.schema)) bySchema.set(entry.schema, entry);
	const rewrites = /* @__PURE__ */ new Map();
	for (const record of pendingRecords.get(ctx) ?? []) {
		const seen = ctx.seen.get(record);
		const names = (seen?.def ?? seen?.schema)?.propertyNames;
		if (!names || names === true || rewrites.has(names)) continue;
		const rewritten = stringifyKeyNames(bySchema, names, /* @__PURE__ */ new Set());
		if (rewritten !== names) rewrites.set(names, rewritten);
	}
	if (!rewrites.size) return;
	for (const entry of ctx.seen.values()) for (const carrier of [entry.schema, entry.def]) {
		const rewritten = carrier && rewrites.get(carrier.propertyNames);
		if (rewritten) carrier.propertyNames = rewritten;
	}
}
var recordProcessor = (schema, ctx, _json, params) => {
	const json = _json;
	const def = schema._zod.def;
	json.type = "object";
	const keyType = def.keyType;
	const patterns = aggregateChecks(keyType).patterns;
	if (def.mode === "loose" && patterns && patterns.size > 0) {
		const valueSchema = processSchema(def.valueType, ctx, {
			...params,
			path: [
				...params.path,
				"patternProperties",
				"*"
			]
		});
		json.patternProperties = {};
		for (const pattern of patterns) assignProp(json.patternProperties, exactPattern(pattern).source, valueSchema);
	} else {
		if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") {
			json.propertyNames = processSchema(def.keyType, ctx, {
				...params,
				path: [...params.path, "propertyNames"]
			});
			let pending = pendingRecords.get(ctx);
			if (!pending) {
				pending = [];
				pendingRecords.set(ctx, pending);
				ctx.deferred.push(() => rewriteKeyNames(ctx));
			}
			pending.push(schema);
		}
		json.additionalProperties = processSchema(def.valueType, ctx, {
			...params,
			path: [...params.path, "additionalProperties"]
		});
	}
	const keyValues = keyType._zod.values;
	const omittableOnInput = ctx.io === "input" && inputOptin(def.valueType) !== void 0;
	if (keyValues && !def.partial && !omittableOnInput) {
		const validKeyValues = [...keyValues].filter((v) => typeof v === "string" || typeof v === "number");
		if (validKeyValues.length > 0) json.required = validKeyValues.map(String);
	}
};
var nullableProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	const inner = processSchema(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	if (ctx.target === "openapi-3.0") {
		seen.ref = def.innerType;
		json.nullable = true;
	} else json.anyOf = [inner, { type: "null" }];
};
var nonoptionalProcessor = (schema, ctx, _json, params) => {
	const def = schema._zod.def;
	processSchema(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
};
/** Round-trips a default value through JSON so the emitted schema is guaranteed to be valid JSON.
* A BigInt has no reliable encoding, so it goes through `unrepresentable` like any other
* unrepresentable value. Returns a sentinel when the caller must not write a default of its own. */
var UNREPRESENTABLE_DEFAULT = Symbol();
function serializeDefaultValue(value, schema, ctx, json, params) {
	let unrepresentable = false;
	const serialized = JSON.stringify(value, (_, val) => {
		if (typeof val !== "bigint") return val;
		unrepresentable = true;
		return null;
	});
	if (!unrepresentable) return JSON.parse(serialized);
	handleUnrepresentable(schema, ctx, json, params, "BigInt defaults cannot be represented in JSON Schema");
	return UNREPRESENTABLE_DEFAULT;
}
var defaultProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	processSchema(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
	if (value !== UNREPRESENTABLE_DEFAULT) json.default = value;
};
var prefaultProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	processSchema(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	if (ctx.io !== "input") return;
	const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
	if (value !== UNREPRESENTABLE_DEFAULT) json._prefault = value;
};
var catchProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	processSchema(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	let catchValue;
	try {
		catchValue = def.catchValue(void 0);
	} catch {
		handleUnrepresentable(schema, ctx, json, params, "Dynamic catch values are not supported in JSON Schema");
		return;
	}
	json.default = catchValue;
};
var pipeProcessor = (schema, ctx, _json, params) => {
	const def = schema._zod.def;
	const inIsTransform = def.in._zod.traits.has("$ZodTransform");
	const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
	processSchema(innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = innerType;
};
var readonlyProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	processSchema(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	json.readOnly = true;
};
var optionalProcessor = (schema, ctx, _json, params) => {
	const def = schema._zod.def;
	processSchema(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
};
// node_modules/zod/v4/classic/errors.js
var _installedErrorProtos = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
function _lazyMethod(proto, key, make) {
	Object.defineProperty(proto, key, {
		configurable: true,
		enumerable: false,
		get() {
			const value = make(this);
			Object.defineProperty(this, key, {
				value,
				configurable: true,
				writable: true
			});
			return value;
		},
		set(value) {
			Object.defineProperty(this, key, {
				value,
				configurable: true,
				writable: true
			});
		}
	});
}
var initializer = (inst, issues) => {
	$ZodError.init(inst, issues);
	inst.name = "ZodError";
	const proto = Object.getPrototypeOf(inst);
	if (_installedErrorProtos.has(proto)) return;
	_installedErrorProtos.add(proto);
	_lazyMethod(proto, "format", (self) => (mapper) => formatError(self, mapper));
	_lazyMethod(proto, "flatten", (self) => (mapper) => flattenError(self, mapper));
	_lazyMethod(proto, "addIssue", (self) => (issue) => {
		self.issues.push(issue);
		self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
	});
	_lazyMethod(proto, "addIssues", (self) => (issues) => {
		self.issues.push(...issues);
		self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
	});
	Object.defineProperty(proto, "isEmpty", {
		configurable: true,
		enumerable: false,
		get() {
			return this.issues.length === 0;
		}
	});
};
var ZodRealError = /*@__PURE__*/ $constructor("ZodError", initializer, void 0, { Parent: Error });
// node_modules/zod/v4/classic/parse.js
var parse = /* @__PURE__ */ _parse(ZodRealError);
var parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
var safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
var safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
var encode = /* @__PURE__ */ _encode(ZodRealError);
var decode = /* @__PURE__ */ _decode(ZodRealError);
var encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
var decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
var safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
var safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
var safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
var safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);
// node_modules/zod/v4/classic/schemas.js
function _ensureDefaultLocale() {
	if (!globalConfig.localeError) config(en_default());
}
function _ensureDefaultMemoizer() {
	if (!globalConfig.memoizer) config({ memoizer: memoizer() });
}
var ZodType = /*@__PURE__*/ $constructor("ZodType", (inst, def) => {
	_ensureDefaultLocale();
	$ZodType.init(inst, def);
	inst.def = def;
	inst.type = def.type;
	return inst;
}, {
	check(...chks) {
		const def = this.def;
		return this.clone(mergeDefs(def, { checks: [...def.checks ?? [], ...chks.map((ch) => typeof ch === "function" ? { _zod: {
			check: ch,
			def: { check: "custom" },
			onattach: []
		} } : ch)] }), { parent: true });
	},
	with(...chks) {
		return this.check(...chks);
	},
	clone(def, params) {
		return clone(this, def, params);
	},
	brand() {
		return this;
	},
	register(reg, meta) {
		reg.add(this, meta);
		return this;
	},
	refine(check, params) {
		return this.check(refine(check, params));
	},
	superRefine(refinement, params) {
		return this.check(superRefine(refinement, params));
	},
	overwrite(fn) {
		return this.check(/* @__PURE__ */ _overwrite(fn));
	},
	optional() {
		return optional(this);
	},
	exactOptional() {
		return exactOptional(this);
	},
	nullable() {
		return nullable(this);
	},
	nullish() {
		return optional(nullable(this));
	},
	nonoptional(params) {
		return nonoptional(this, params);
	},
	array() {
		return array(this);
	},
	or(arg) {
		return union([this, arg]);
	},
	and(arg) {
		return intersection(this, arg);
	},
	transform(tx) {
		return pipe(this, transform(tx));
	},
	default(d) {
		return _default(this, d);
	},
	prefault(d) {
		return prefault(this, d);
	},
	catch(params) {
		return _catch(this, params);
	},
	pipe(target) {
		return pipe(this, target);
	},
	readonly() {
		return readonly(this);
	},
	describe(description) {
		const cl = this.clone();
		globalRegistry.add(cl, { description });
		return cl;
	},
	meta(...args) {
		if (args.length === 0) return globalRegistry.get(this);
		const cl = this.clone();
		globalRegistry.add(cl, args[0]);
		return cl;
	},
	isOptional() {
		return this.safeParse(void 0).success;
	},
	isNullable() {
		return this.safeParse(null).success;
	},
	apply(fn, ...args) {
		return args.length === 0 ? fn(this) : fn(this, ...args);
	},
	get "~standard"() {
		return hide(this, "~standard", {
			...standardProps(this),
			jsonSchema: {
				input: createStandardJSONSchemaMethod(this, "input"),
				output: createStandardJSONSchemaMethod(this, "output")
			}
		});
	},
	set "~standard"(value) {
		own(this, "~standard", value);
	},
	parse: function _parse(data, params) {
		return parse(this, data, params, { callee: _parse });
	},
	parseAsync: async function _parseAsync(data, params) {
		return await parseAsync(this, data, params, { callee: _parseAsync });
	},
	safeParse(data, params) {
		return safeParse(this, data, params);
	},
	async safeParseAsync(data, params) {
		return safeParseAsync(this, data, params);
	},
	get spa() {
		return this?.safeParseAsync;
	},
	set spa(value) {
		own(this, "spa", value);
	},
	validate(data, params) {
		return validate(this, data, params);
	},
	validateAsync(data, params) {
		return validateAsync$1(this, data, params);
	},
	encode: function _encode(data, params) {
		return encode(this, data, params, { callee: _encode });
	},
	decode: function _decode(data, params) {
		return decode(this, data, params, { callee: _decode });
	},
	encodeAsync: async function _encodeAsync(data, params) {
		return await encodeAsync(this, data, params, { callee: _encodeAsync });
	},
	decodeAsync: async function _decodeAsync(data, params) {
		return await decodeAsync(this, data, params, { callee: _decodeAsync });
	},
	safeEncode(data, params) {
		return safeEncode(this, data, params);
	},
	safeDecode(data, params) {
		return safeDecode(this, data, params);
	},
	async safeEncodeAsync(data, params) {
		return safeEncodeAsync(this, data, params);
	},
	async safeDecodeAsync(data, params) {
		return safeDecodeAsync(this, data, params);
	},
	toJSONSchema(params) {
		return createToJSONSchemaMethod(this, {})(params);
	},
	get description() {
		return globalRegistry.get(this)?.description;
	},
	get _def() {
		return this._zod.def;
	}
});
/** @internal */
var _ZodString = /*@__PURE__*/ $constructor("_ZodString", (inst, def) => {
	$ZodString.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
}, /*@__PURE__*/ derived({
	format: (inst) => aggregateChecks(inst).format ?? null,
	minLength: (inst) => aggregateChecks(inst).minimum ?? null,
	maxLength: (inst) => aggregateChecks(inst).maximum ?? null
}, {
	regex(...args) {
		return this.check(/* @__PURE__ */ _regex(...args));
	},
	includes(...args) {
		return this.check(/* @__PURE__ */ _includes(...args));
	},
	startsWith(...args) {
		return this.check(/* @__PURE__ */ _startsWith(...args));
	},
	endsWith(...args) {
		return this.check(/* @__PURE__ */ _endsWith(...args));
	},
	min(...args) {
		return this.check(/* @__PURE__ */ _minLength(...args));
	},
	max(...args) {
		return this.check(/* @__PURE__ */ _maxLength(...args));
	},
	length(...args) {
		return this.check(/* @__PURE__ */ _length(...args));
	},
	nonempty(...args) {
		return this.check(/* @__PURE__ */ _minLength(1, ...args));
	},
	lowercase(params) {
		return this.check(/* @__PURE__ */ _lowercase(params));
	},
	uppercase(params) {
		return this.check(/* @__PURE__ */ _uppercase(params));
	},
	trim() {
		return this.check(/* @__PURE__ */ _trim());
	},
	normalize(...args) {
		return this.check(/* @__PURE__ */ _normalize(...args));
	},
	toLowerCase() {
		return this.check(/* @__PURE__ */ _toLowerCase());
	},
	toUpperCase() {
		return this.check(/* @__PURE__ */ _toUpperCase());
	},
	slugify() {
		return this.check(/* @__PURE__ */ _slugify());
	}
}));
var ZodString = /*@__PURE__*/ $constructor("ZodString", (inst, def) => {
	$ZodString.init(inst, def);
	_ZodString.init(inst, def);
}, {
	email(params) {
		return this.check(/* @__PURE__ */ _email(ZodEmail, params));
	},
	url(params) {
		return this.check(/* @__PURE__ */ _url(ZodURL, params));
	},
	jwt(params) {
		return this.check(/* @__PURE__ */ _jwt(ZodJWT, params));
	},
	emoji(params) {
		return this.check(/* @__PURE__ */ _emoji(ZodEmoji, params));
	},
	guid(params) {
		return this.check(/* @__PURE__ */ _guid(ZodGUID, params));
	},
	uuid(params) {
		return this.check(/* @__PURE__ */ _uuid(ZodUUID, params));
	},
	uuidv4(params) {
		return this.check(/* @__PURE__ */ _uuidv4(ZodUUID, params));
	},
	uuidv6(params) {
		return this.check(/* @__PURE__ */ _uuidv6(ZodUUID, params));
	},
	uuidv7(params) {
		return this.check(/* @__PURE__ */ _uuidv7(ZodUUID, params));
	},
	nanoid(params) {
		return this.check(/* @__PURE__ */ _nanoid(ZodNanoID, params));
	},
	cuid(params) {
		return this.check(/* @__PURE__ */ _cuid(ZodCUID, params));
	},
	cuid2(params) {
		return this.check(/* @__PURE__ */ _cuid2(ZodCUID2, params));
	},
	ulid(params) {
		return this.check(/* @__PURE__ */ _ulid(ZodULID, params));
	},
	base64(params) {
		return this.check(/* @__PURE__ */ _base64(ZodBase64, params));
	},
	base64url(params) {
		return this.check(/* @__PURE__ */ _base64url(ZodBase64URL, params));
	},
	xid(params) {
		return this.check(/* @__PURE__ */ _xid(ZodXID, params));
	},
	ksuid(params) {
		return this.check(/* @__PURE__ */ _ksuid(ZodKSUID, params));
	},
	ipv4(params) {
		return this.check(/* @__PURE__ */ _ipv4(ZodIPv4, params));
	},
	ipv6(params) {
		return this.check(/* @__PURE__ */ _ipv6(ZodIPv6, params));
	},
	cidrv4(params) {
		return this.check(/* @__PURE__ */ _cidrv4(ZodCIDRv4, params));
	},
	cidrv6(params) {
		return this.check(/* @__PURE__ */ _cidrv6(ZodCIDRv6, params));
	},
	e164(params) {
		return this.check(/* @__PURE__ */ _e164(ZodE164, params));
	},
	datetime(params) {
		return this.check(/* @__PURE__ */ _isoDateTime(ZodISODateTime, params));
	},
	date(params) {
		return this.check(/* @__PURE__ */ _isoDate(ZodISODate, params));
	},
	time(params) {
		return this.check(/* @__PURE__ */ _isoTime(ZodISOTime, params));
	},
	duration(params) {
		return this.check(/* @__PURE__ */ _isoDuration(ZodISODuration, params));
	}
});
function string(params) {
	return /* @__PURE__ */ _string(ZodString, params);
}
var ZodStringFormat = /*@__PURE__*/ $constructor("ZodStringFormat", (inst, def) => {
	$ZodStringFormat.init(inst, def);
	_ZodString.init(inst, def);
});
var ZodISODateTime = /*@__PURE__*/ $constructor("ZodISODateTime", (inst, def) => {
	$ZodISODateTime.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodISODate = /*@__PURE__*/ $constructor("ZodISODate", (inst, def) => {
	$ZodISODate.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodISOTime = /*@__PURE__*/ $constructor("ZodISOTime", (inst, def) => {
	$ZodISOTime.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodISODuration = /*@__PURE__*/ $constructor("ZodISODuration", (inst, def) => {
	$ZodISODuration.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodEmail = /*@__PURE__*/ $constructor("ZodEmail", (inst, def) => {
	$ZodEmail.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodGUID = /*@__PURE__*/ $constructor("ZodGUID", (inst, def) => {
	$ZodGUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodUUID = /*@__PURE__*/ $constructor("ZodUUID", (inst, def) => {
	$ZodUUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodURL = /*@__PURE__*/ $constructor("ZodURL", (inst, def) => {
	$ZodURL.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodEmoji = /*@__PURE__*/ $constructor("ZodEmoji", (inst, def) => {
	$ZodEmoji.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodNanoID = /*@__PURE__*/ $constructor("ZodNanoID", (inst, def) => {
	$ZodNanoID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link ZodCUID2} instead.
* See https://github.com/paralleldrive/cuid.
*/
var ZodCUID = /*@__PURE__*/ $constructor("ZodCUID", (inst, def) => {
	$ZodCUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodCUID2 = /*@__PURE__*/ $constructor("ZodCUID2", (inst, def) => {
	$ZodCUID2.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodULID = /*@__PURE__*/ $constructor("ZodULID", (inst, def) => {
	$ZodULID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodXID = /*@__PURE__*/ $constructor("ZodXID", (inst, def) => {
	$ZodXID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodKSUID = /*@__PURE__*/ $constructor("ZodKSUID", (inst, def) => {
	$ZodKSUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodIPv4 = /*@__PURE__*/ $constructor("ZodIPv4", (inst, def) => {
	$ZodIPv4.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodIPv6 = /*@__PURE__*/ $constructor("ZodIPv6", (inst, def) => {
	$ZodIPv6.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodCIDRv4 = /*@__PURE__*/ $constructor("ZodCIDRv4", (inst, def) => {
	$ZodCIDRv4.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodCIDRv6 = /*@__PURE__*/ $constructor("ZodCIDRv6", (inst, def) => {
	$ZodCIDRv6.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodBase64 = /*@__PURE__*/ $constructor("ZodBase64", (inst, def) => {
	$ZodBase64.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodBase64URL = /*@__PURE__*/ $constructor("ZodBase64URL", (inst, def) => {
	$ZodBase64URL.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodE164 = /*@__PURE__*/ $constructor("ZodE164", (inst, def) => {
	$ZodE164.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodJWT = /*@__PURE__*/ $constructor("ZodJWT", (inst, def) => {
	$ZodJWT.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodNumber = /*@__PURE__*/ $constructor("ZodNumber", (inst, def) => {
	$ZodNumber.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
	inst.isFinite = true;
}, /*@__PURE__*/ derived({
	minValue: (inst) => {
		const { minimum, exclusiveMinimum } = aggregateChecks(inst);
		return Math.max(minimum ?? Number.NEGATIVE_INFINITY, exclusiveMinimum ?? Number.NEGATIVE_INFINITY);
	},
	maxValue: (inst) => {
		const { maximum, exclusiveMaximum } = aggregateChecks(inst);
		return Math.min(maximum ?? Number.POSITIVE_INFINITY, exclusiveMaximum ?? Number.POSITIVE_INFINITY);
	},
	isInt: (inst) => {
		const { isInt, multipleOf } = aggregateChecks(inst);
		return !!isInt || !!multipleOf?.some(Number.isSafeInteger);
	},
	format: (inst) => aggregateChecks(inst).format ?? null
}, {
	gt(value, params) {
		return this.check(/* @__PURE__ */ _gt(value, params));
	},
	gte(value, params) {
		return this.check(/* @__PURE__ */ _gte(value, params));
	},
	min(value, params) {
		return this.check(/* @__PURE__ */ _gte(value, params));
	},
	lt(value, params) {
		return this.check(/* @__PURE__ */ _lt(value, params));
	},
	lte(value, params) {
		return this.check(/* @__PURE__ */ _lte(value, params));
	},
	max(value, params) {
		return this.check(/* @__PURE__ */ _lte(value, params));
	},
	int(params) {
		return this.check(int(params));
	},
	safe(params) {
		return this.check(int(params));
	},
	positive(params) {
		return this.check(/* @__PURE__ */ _gt(0, params));
	},
	nonnegative(params) {
		return this.check(/* @__PURE__ */ _gte(0, params));
	},
	negative(params) {
		return this.check(/* @__PURE__ */ _lt(0, params));
	},
	nonpositive(params) {
		return this.check(/* @__PURE__ */ _lte(0, params));
	},
	multipleOf(value, params) {
		return this.check(/* @__PURE__ */ _multipleOf(value, params));
	},
	step(value, params) {
		return this.check(/* @__PURE__ */ _multipleOf(value, params));
	},
	finite() {
		return this;
	}
}));
function number(params) {
	return /* @__PURE__ */ _number(ZodNumber, params);
}
var ZodNumberFormat = /*@__PURE__*/ $constructor("ZodNumberFormat", (inst, def) => {
	$ZodNumberFormat.init(inst, def);
	ZodNumber.init(inst, def);
});
function int(params) {
	return /* @__PURE__ */ _int(ZodNumberFormat, params);
}
var ZodBoolean = /*@__PURE__*/ $constructor("ZodBoolean", (inst, def) => {
	$ZodBoolean.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json, params);
});
function boolean(params) {
	return /* @__PURE__ */ _boolean(ZodBoolean, params);
}
var ZodNull = /*@__PURE__*/ $constructor("ZodNull", (inst, def) => {
	$ZodNull.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => nullProcessor(inst, ctx, json, params);
});
function _null(params) {
	return /* @__PURE__ */ _null$1(ZodNull, params);
}
var ZodUnknown = /*@__PURE__*/ $constructor("ZodUnknown", (inst, def) => {
	$ZodUnknown.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => void 0;
});
function unknown() {
	return /* @__PURE__ */ _unknown(ZodUnknown);
}
var ZodNever = /*@__PURE__*/ $constructor("ZodNever", (inst, def) => {
	$ZodNever.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json, params);
});
function never(params) {
	return /* @__PURE__ */ _never(ZodNever, params);
}
var ZodArray = /*@__PURE__*/ $constructor("ZodArray", (inst, def) => {
	_ensureDefaultMemoizer();
	$ZodArray.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
	inst.element = def.element;
}, {
	min(n, params) {
		return this.check(/* @__PURE__ */ _minLength(n, params));
	},
	nonempty(params) {
		return this.check(/* @__PURE__ */ _minLength(1, params));
	},
	max(n, params) {
		return this.check(/* @__PURE__ */ _maxLength(n, params));
	},
	length(n, params) {
		return this.check(/* @__PURE__ */ _length(n, params));
	},
	unwrap() {
		return this.element;
	}
});
function array(element, params) {
	return /* @__PURE__ */ _array(ZodArray, element, params);
}
var ZodObject = /*@__PURE__*/ $constructor("ZodObject", (inst, def) => {
	_ensureDefaultMemoizer();
	$ZodObjectJIT.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
	installLazyProp(inst, "shape", (self) => self._zod.def.shape, false);
}, {
	keyof() {
		return _enum(Object.keys(this._zod.def.shape));
	},
	catchall(catchall) {
		return this.clone(mergeDefs(this._zod.def, { catchall }));
	},
	passthrough() {
		return this.clone(mergeDefs(this._zod.def, { catchall: unknown() }));
	},
	loose() {
		return this.clone(mergeDefs(this._zod.def, { catchall: unknown() }));
	},
	strict() {
		return this.clone(mergeDefs(this._zod.def, { catchall: never() }));
	},
	strip() {
		return this.clone(mergeDefs(this._zod.def, { catchall: void 0 }));
	},
	extend(incoming) {
		return extend(this, incoming);
	},
	safeExtend(incoming) {
		return safeExtend(this, incoming);
	},
	merge(other) {
		return merge(this, other);
	},
	pick(mask) {
		return pick(this, mask);
	},
	omit(mask) {
		return omit(this, mask);
	},
	partial(...args) {
		return partial(ZodOptional, this, args[0]);
	},
	exactPartial(...args) {
		return partial(ZodExactOptional, this, args[0], "exactPartial");
	},
	required(...args) {
		return required(ZodNonOptional, this, args[0]);
	}
});
function object(shape, params) {
	return new ZodObject({
		type: "object",
		shape: shape ?? {},
		...normalizeParams(params)
	});
}
function strictObject(shape, params) {
	return new ZodObject({
		type: "object",
		shape,
		catchall: never(),
		...normalizeParams(params)
	});
}
var ZodUnion = /*@__PURE__*/ $constructor("ZodUnion", (inst, def) => {
	$ZodUnion.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
	inst.options = def.options;
});
function union(options, params) {
	return new ZodUnion({
		type: "union",
		options,
		...normalizeParams(params)
	});
}
var ZodDiscriminatedUnion = /*@__PURE__*/ $constructor("ZodDiscriminatedUnion", (inst, def) => {
	ZodUnion.init(inst, def);
	$ZodDiscriminatedUnion.init(inst, def);
});
function discriminatedUnion(discriminator, options, params) {
	return new ZodDiscriminatedUnion({
		type: "union",
		options,
		discriminator,
		...normalizeParams(params)
	});
}
var ZodIntersection = /*@__PURE__*/ $constructor("ZodIntersection", (inst, def) => {
	$ZodIntersection.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
});
function intersection(left, right) {
	return new ZodIntersection({
		type: "intersection",
		left,
		right
	});
}
var ZodRecord = /*@__PURE__*/ $constructor("ZodRecord", (inst, def) => {
	_ensureDefaultMemoizer();
	$ZodRecord.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => recordProcessor(inst, ctx, json, params);
	inst.keyType = def.keyType;
	inst.valueType = def.valueType;
});
function record(keyType, valueType, params) {
	if (!valueType || !valueType._zod) return new ZodRecord({
		type: "record",
		keyType: string(),
		valueType: keyType,
		...normalizeParams(valueType)
	});
	return new ZodRecord({
		type: "record",
		keyType,
		valueType,
		...normalizeParams(params)
	});
}
var ZodEnum = /*@__PURE__*/ $constructor("ZodEnum", (inst, def) => {
	$ZodEnum.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
	inst.enum = def.entries;
	inst.options = [...inst._zod.values];
	const keys = new Set(Object.keys(def.entries));
	inst.extract = (values, params) => {
		const newEntries = {};
		for (const value of values) if (keys.has(value)) newEntries[value] = def.entries[value];
		else throw new Error(`Key ${value} not found in enum`);
		return new ZodEnum({
			...def,
			checks: [],
			...normalizeParams(params),
			entries: newEntries
		});
	};
	inst.exclude = (values, params) => {
		const newEntries = { ...def.entries };
		for (const value of values) if (keys.has(value)) delete newEntries[value];
		else throw new Error(`Key ${value} not found in enum`);
		return new ZodEnum({
			...def,
			checks: [],
			...normalizeParams(params),
			entries: newEntries
		});
	};
});
function _enum(values, params) {
	return new ZodEnum({
		type: "enum",
		entries: Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values,
		...normalizeParams(params)
	});
}
var ZodLiteral = /*@__PURE__*/ $constructor("ZodLiteral", (inst, def) => {
	$ZodLiteral.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
	inst.values = new Set(def.values);
	Object.defineProperty(inst, "value", { get() {
		if (def.values.length > 1) throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
		return def.values[0];
	} });
});
function literal(value, params) {
	return new ZodLiteral({
		type: "literal",
		values: Array.isArray(value) ? value : [value],
		...normalizeParams(params)
	});
}
var ZodTransform = /*@__PURE__*/ $constructor("ZodTransform", (inst, def) => {
	_ensureDefaultMemoizer();
	$ZodTransform.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
	inst._zod.parse = (payload, _ctx) => {
		if (_ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
		payload.addIssue = (issue) => {
			if (typeof issue === "string") payload.issues.push(issue$1(issue, payload.value, def));
			else {
				const _issue = issue;
				if (_issue.fatal) _issue.continue = false;
				_issue.code ?? (_issue.code = "custom");
				if (!("input" in _issue)) _issue.input = payload.value;
				_issue.inst ?? (_issue.inst = inst);
				payload.issues.push(issue$1(_issue));
			}
		};
		const output = def.transform(payload.value, payload);
		if (output instanceof Promise) return output.then((output) => {
			payload.value = output;
			return payload;
		});
		payload.value = output;
		return payload;
	};
});
function transform(fn) {
	return new ZodTransform({
		type: "transform",
		transform: fn
	});
}
var ZodOptional = /*@__PURE__*/ $constructor("ZodOptional", (inst, def) => {
	$ZodOptional.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
	return new ZodOptional({
		type: "optional",
		innerType
	});
}
var ZodExactOptional = /*@__PURE__*/ $constructor("ZodExactOptional", (inst, def) => {
	$ZodExactOptional.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function exactOptional(innerType) {
	return new ZodExactOptional({
		type: "optional",
		innerType
	});
}
var ZodNullable = /*@__PURE__*/ $constructor("ZodNullable", (inst, def) => {
	$ZodNullable.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
	return new ZodNullable({
		type: "nullable",
		innerType
	});
}
var ZodDefault = /*@__PURE__*/ $constructor("ZodDefault", (inst, def) => {
	$ZodDefault.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
	inst.removeDefault = inst.unwrap;
});
function _default(innerType, defaultValue) {
	return new ZodDefault({
		type: "default",
		innerType,
		get defaultValue() {
			return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
		}
	});
}
var ZodPrefault = /*@__PURE__*/ $constructor("ZodPrefault", (inst, def) => {
	$ZodPrefault.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
	return new ZodPrefault({
		type: "prefault",
		innerType,
		get defaultValue() {
			return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
		}
	});
}
var ZodNonOptional = /*@__PURE__*/ $constructor("ZodNonOptional", (inst, def) => {
	$ZodNonOptional.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
	return new ZodNonOptional({
		type: "nonoptional",
		innerType,
		...normalizeParams(params)
	});
}
var ZodCatch = /*@__PURE__*/ $constructor("ZodCatch", (inst, def) => {
	$ZodCatch.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
	inst.removeCatch = inst.unwrap;
});
function _catch(innerType, catchValue) {
	return new ZodCatch({
		type: "catch",
		innerType,
		catchValue: typeof catchValue === "function" ? catchValue : constantCatch(catchValue)
	});
}
var ZodPipe = /*@__PURE__*/ $constructor("ZodPipe", (inst, def) => {
	$ZodPipe.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
	inst.in = def.in;
	inst.out = def.out;
});
function pipe(in_, out) {
	return new ZodPipe({
		type: "pipe",
		in: in_,
		out
	});
}
var ZodReadonly = /*@__PURE__*/ $constructor("ZodReadonly", (inst, def) => {
	$ZodReadonly.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function readonly(innerType) {
	return new ZodReadonly({
		type: "readonly",
		innerType
	});
}
var ZodCustom = /*@__PURE__*/ $constructor("ZodCustom", (inst, def) => {
	$ZodCustom.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
});
function refine(fn, _params = {}) {
	return /* @__PURE__ */ _refine(ZodCustom, fn, _params);
}
function superRefine(fn, params) {
	return /* @__PURE__ */ _superRefine(fn, params);
}
// packages/simulation/src/schema.ts
var MAX_DIM_MM$1 = 1e5;
var MAX_COORD_MM$1 = 1e5;
var MAX_FOOTPRINT_MM = 1e4;
var MAX_MARGIN_MM$1 = 1e4;
var MAX_SPEED_MMPS = 1e4;
var MAX_TIME_MS = 2147483647;
var MAX_QUANTITY$1 = 1e6;
var MAX_SERVICE_DURATION_MS = MAX_TIME_MS;
var MAX_STAGING = 1e4;
var MAX_RUN_EVENTS = 1e7;
var MAX_EVENTS_PER_TIMESTAMP = 1e5;
var MAX_TEXT_LEN$1 = 2e3;
var id$1 = string().min(1).max(128);
var dimMm$1 = number().int().min(1).max(MAX_DIM_MM$1);
var coordMm$1 = number().int().min(-1e5).max(MAX_COORD_MM$1);
var heightMm = number().int().min(0).max(MAX_DIM_MM$1);
var timeMs = number().int().min(0).max(MAX_TIME_MS);
var positiveTimeMs = number().int().min(1).max(MAX_TIME_MS);
var quantity = number().int().min(1).max(MAX_QUANTITY$1);
var pointSchema$1 = strictObject({
	x: coordMm$1,
	z: coordMm$1
});
var anchorSchema = strictObject({
	x: coordMm$1,
	y: heightMm,
	z: coordMm$1
});
var dimensionsSchema$1 = strictObject({
	width: dimMm$1,
	depth: dimMm$1,
	height: dimMm$1
});
var rackSchema$1 = strictObject({
	id: id$1,
	positionMm: pointSchema$1,
	dimensionsMm: dimensionsSchema$1
});
var obstacleSchema = strictObject({
	id: id$1,
	minXMm: coordMm$1,
	minZMm: coordMm$1,
	maxXMm: coordMm$1,
	maxZMm: coordMm$1
});
var trafficZoneSchema = strictObject({
	id: id$1,
	kind: union([literal("narrow-aisle"), literal("intersection")]),
	minXMm: coordMm$1,
	minZMm: coordMm$1,
	maxXMm: coordMm$1,
	maxZMm: coordMm$1
});
var geometrySchema = strictObject({
	room: strictObject({
		widthMm: dimMm$1,
		depthMm: dimMm$1
	}),
	racks: array(rackSchema$1).max(32),
	obstacles: array(obstacleSchema).max(256),
	trafficZones: array(trafficZoneSchema).max(64).optional()
});
var productSchema$1 = strictObject({
	id: id$1,
	label: string().min(1).max(MAX_TEXT_LEN$1),
	itemDimensionsMm: dimensionsSchema$1,
	handlingClass: string().min(1).max(128),
	capacityCostUnits: number().int().min(1).max(MAX_QUANTITY$1),
	visualAssetRef: string().min(1).max(MAX_TEXT_LEN$1).optional()
});
var locationSchema$1 = strictObject({
	id: id$1,
	rackId: id$1,
	storageAnchorMm: anchorSchema,
	approachPointMm: pointSchema$1,
	usableDimensionsMm: dimensionsSchema$1,
	storageClass: string().min(1).max(128),
	maxQuantity: quantity,
	restrictions: strictObject({
		eligibleHandlingClasses: array(id$1).min(1).max(64),
		eligibleProductIds: array(id$1).max(64).optional()
	})
});
var stockSchema = strictObject({
	locationId: id$1,
	productId: id$1,
	quantity
});
var homeAssignmentSchema = strictObject({
	productId: id$1,
	locationId: id$1
});
var mobileUnitSchema = strictObject({
	id: id$1,
	role: union([literal("picker"), literal("putaway")]),
	footprintMm: strictObject({
		width: number().int().min(1).max(MAX_FOOTPRINT_MM),
		length: number().int().min(1).max(MAX_FOOTPRINT_MM),
		margin: number().int().min(0).max(MAX_MARGIN_MM$1)
	}),
	speedMmPerSecond: number().int().min(1).max(MAX_SPEED_MMPS),
	loadCapacityUnits: number().int().min(1).max(MAX_QUANTITY$1),
	eligibleHandlingClasses: array(id$1).min(1).max(64),
	parkingSlotMm: pointSchema$1
});
var slotSchema = strictObject({
	id: id$1,
	x: coordMm$1,
	z: coordMm$1
});
var resourceSchema = strictObject({
	id: id$1,
	kind: union([
		literal("receiving"),
		literal("packing"),
		literal("dispatch")
	]),
	servicePositions: array(slotSchema).min(1).max(16),
	queueSlots: array(slotSchema).max(64),
	serviceCapacity: number().int().min(1).max(64),
	inputStagingCapacity: number().int().min(0).max(MAX_STAGING),
	outputStagingCapacity: number().int().min(0).max(MAX_STAGING),
	serviceDurationMs: number().int().min(1).max(MAX_SERVICE_DURATION_MS)
});
var operationsResourceSchema = resourceSchema;
var scheduleLineSchema = strictObject({
	productId: id$1,
	quantity
});
var scheduledOrderSchema = strictObject({
	id: id$1,
	arrivalTimeMs: timeMs,
	lines: array(scheduleLineSchema).min(1).max(64)
});
var scheduledDeliverySchema = strictObject({
	id: id$1,
	arrivalTimeMs: timeMs,
	lines: array(scheduleLineSchema).min(1).max(64)
});
var provenanceSchema$1 = strictObject({
	category: union([literal("synthetic"), literal("reconstructed")]),
	description: string().min(1).max(MAX_TEXT_LEN$1),
	sourceUrls: array(string().max(MAX_TEXT_LEN$1)).max(64),
	assumptions: array(string().max(MAX_TEXT_LEN$1)).max(256),
	inventedFields: array(string().max(MAX_TEXT_LEN$1)).max(256)
});
var runSettingsSchema = discriminatedUnion("mode", [strictObject({
	mode: literal("fixed-window"),
	horizonMs: positiveTimeMs
}), strictObject({
	mode: literal("finite-cohort"),
	arrivalCutoffMs: timeMs
})]);
var policiesSchema = strictObject({
	reservePolicy: literal("full-order-all-or-none"),
	run: runSettingsSchema,
	eventLimits: strictObject({
		maxProcessedEvents: number().int().min(1).max(MAX_RUN_EVENTS),
		maxEventsPerTimestamp: number().int().min(1).max(MAX_EVENTS_PER_TIMESTAMP)
	})
});
function uniqueIds$1(items, key, ctx) {
	const seen = /* @__PURE__ */ new Set();
	for (const item of items) {
		const k = key(item);
		if (seen.has(k)) {
			ctx.addIssue({
				code: "custom",
				message: `duplicate id: ${k}`
			});
			return;
		}
		seen.add(k);
	}
}
var operationsScenarioSchema = strictObject({
	schemaVersion: literal(OPERATIONS_SCHEMA_VERSION),
	engineVersion: literal(OPERATIONS_ENGINE_VERSION),
	id: id$1,
	provenance: provenanceSchema$1,
	seed: string().min(1).max(256),
	units: strictObject({
		quantityUnit: literal("item"),
		capacityUnit: literal("handling-unit")
	}),
	geometry: geometrySchema,
	products: array(productSchema$1).min(1).max(64),
	locations: array(locationSchema$1).min(1).max(128),
	initialStock: array(stockSchema).max(512),
	homeAssignments: array(homeAssignmentSchema).max(64).optional(),
	mobileUnits: array(mobileUnitSchema).min(1).max(64),
	resources: array(resourceSchema).min(1).max(32),
	orderSchedule: array(scheduledOrderSchema).max(256),
	deliverySchedule: array(scheduledDeliverySchema).max(256),
	policies: policiesSchema
}).superRefine((s, ctx) => {
	uniqueIds$1(s.geometry.racks, (r) => r.id, ctx);
	uniqueIds$1(s.geometry.obstacles, (o) => o.id, ctx);
	if (s.geometry.trafficZones) uniqueIds$1(s.geometry.trafficZones, (z) => z.id, ctx);
	uniqueIds$1(s.products, (p) => p.id, ctx);
	uniqueIds$1(s.locations, (l) => l.id, ctx);
	uniqueIds$1(s.mobileUnits, (a) => a.id, ctx);
	uniqueIds$1(s.resources, (r) => r.id, ctx);
	uniqueIds$1(s.orderSchedule, (o) => o.id, ctx);
	uniqueIds$1(s.deliverySchedule, (d) => d.id, ctx);
	const orderIds = new Set(s.orderSchedule.map((o) => o.id));
	for (const d of s.deliverySchedule) if (orderIds.has(d.id)) ctx.addIssue({
		code: "custom",
		message: `duplicate scheduled work id: ${d.id}`
	});
	for (const o of s.geometry.obstacles) if (o.minXMm >= o.maxXMm || o.minZMm >= o.maxZMm) ctx.addIssue({
		code: "custom",
		message: `degenerate obstacle rectangle: ${o.id}`
	});
	for (const z of s.geometry.trafficZones ?? []) {
		if (z.minXMm >= z.maxXMm || z.minZMm >= z.maxZMm) ctx.addIssue({
			code: "custom",
			message: `degenerate traffic zone rectangle: ${z.id}`
		});
		if (z.minXMm < 0 || z.minZMm < 0 || z.maxXMm > s.geometry.room.widthMm || z.maxZMm > s.geometry.room.depthMm) ctx.addIssue({
			code: "custom",
			message: `traffic zone ${z.id} exceeds room bounds`
		});
	}
	const rackIds = new Set(s.geometry.racks.map((r) => r.id));
	const productsById = new Map(s.products.map((p) => [p.id, p]));
	const locationsById = new Map(s.locations.map((l) => [l.id, l]));
	const eligible = (locationId, productId) => {
		const loc = locationsById.get(locationId);
		const product = productsById.get(productId);
		if (!loc || !product) return false;
		if (!loc.restrictions.eligibleHandlingClasses.includes(product.handlingClass)) return false;
		const narrowed = loc.restrictions.eligibleProductIds;
		return !narrowed || narrowed.includes(productId);
	};
	const fitsFixedOrientation = (item, usable) => item.width <= usable.width && item.depth <= usable.depth && item.height <= usable.height;
	for (const l of s.locations) {
		if (!rackIds.has(l.rackId)) ctx.addIssue({
			code: "custom",
			message: `location ${l.id} references unknown rack ${l.rackId}`
		});
		for (const pid of l.restrictions.eligibleProductIds ?? []) if (!productsById.has(pid)) ctx.addIssue({
			code: "custom",
			message: `location ${l.id} restricts to unknown product ${pid}`
		});
	}
	const stockKeys = /* @__PURE__ */ new Set();
	const stockByLocation = /* @__PURE__ */ new Map();
	for (const entry of s.initialStock) {
		const loc = locationsById.get(entry.locationId);
		if (!loc) {
			ctx.addIssue({
				code: "custom",
				message: `stock references unknown location ${entry.locationId}`
			});
			continue;
		}
		if (!productsById.has(entry.productId)) {
			ctx.addIssue({
				code: "custom",
				message: `stock references unknown product ${entry.productId}`
			});
			continue;
		}
		const key = `${entry.locationId} ${entry.productId}`;
		if (stockKeys.has(key)) {
			ctx.addIssue({
				code: "custom",
				message: `duplicate stock entry: ${key}`
			});
			continue;
		}
		stockKeys.add(key);
		if (!eligible(entry.locationId, entry.productId)) ctx.addIssue({
			code: "custom",
			message: `stock product ${entry.productId} is ineligible at ${entry.locationId}`
		});
		const stockedProduct = productsById.get(entry.productId);
		if (stockedProduct && !fitsFixedOrientation(stockedProduct.itemDimensionsMm, loc.usableDimensionsMm)) ctx.addIssue({
			code: "custom",
			message: `product ${entry.productId} item dimensions exceed location ${entry.locationId} usable dimensions (fixed orientation)`
		});
		const prior = stockByLocation.get(entry.locationId);
		if (prior && prior.productId !== entry.productId) {
			ctx.addIssue({
				code: "custom",
				message: `location ${entry.locationId} holds more than one product`
			});
			continue;
		}
		const total = (prior?.total ?? 0) + entry.quantity;
		stockByLocation.set(entry.locationId, {
			productId: entry.productId,
			total
		});
		if (entry.quantity > loc.maxQuantity || total > loc.maxQuantity) ctx.addIssue({
			code: "custom",
			message: `stock at ${entry.locationId} exceeds maxQuantity ${loc.maxQuantity}`
		});
	}
	if (s.homeAssignments) {
		uniqueIds$1(s.homeAssignments, (h) => h.productId, ctx);
		const homeLocations = /* @__PURE__ */ new Set();
		for (const h of s.homeAssignments) {
			if (homeLocations.has(h.locationId)) ctx.addIssue({
				code: "custom",
				message: `duplicate home location: ${h.locationId}`
			});
			homeLocations.add(h.locationId);
		}
		const assigned = new Set(s.homeAssignments.map((h) => h.productId));
		for (const p of s.products) if (!assigned.has(p.id)) ctx.addIssue({
			code: "custom",
			message: `home assignment missing for product ${p.id}`
		});
		for (const h of s.homeAssignments) {
			if (!productsById.has(h.productId)) {
				ctx.addIssue({
					code: "custom",
					message: `home assignment references unknown product ${h.productId}`
				});
				continue;
			}
			if (!locationsById.has(h.locationId)) {
				ctx.addIssue({
					code: "custom",
					message: `home assignment references unknown location ${h.locationId}`
				});
				continue;
			}
			if (!eligible(h.locationId, h.productId)) ctx.addIssue({
				code: "custom",
				message: `home ${h.locationId} is ineligible for product ${h.productId}`
			});
			const homeProduct = productsById.get(h.productId);
			const homeLocation = locationsById.get(h.locationId);
			if (homeProduct && homeLocation && !fitsFixedOrientation(homeProduct.itemDimensionsMm, homeLocation.usableDimensionsMm)) ctx.addIssue({
				code: "custom",
				message: `product ${h.productId} item dimensions exceed location ${h.locationId} usable dimensions (fixed orientation)`
			});
		}
	}
	const parking = /* @__PURE__ */ new Set();
	for (const a of s.mobileUnits) {
		const key = `${a.parkingSlotMm.x},${a.parkingSlotMm.z}`;
		if (parking.has(key)) ctx.addIssue({
			code: "custom",
			message: `duplicate parking slot at ${key}`
		});
		parking.add(key);
	}
	for (const r of s.resources) {
		const slots = [...r.servicePositions, ...r.queueSlots];
		uniqueIds$1(slots, (slot) => slot.id, ctx);
		const coords = /* @__PURE__ */ new Set();
		for (const slot of slots) {
			const key = `${slot.x},${slot.z}`;
			if (coords.has(key)) ctx.addIssue({
				code: "custom",
				message: `resource ${r.id} stacks slots at ${key}`
			});
			coords.add(key);
		}
	}
	const arrivalBound = s.policies.run.mode === "fixed-window" ? s.policies.run.horizonMs : s.policies.run.arrivalCutoffMs;
	const checkSchedule = (entries, kind) => {
		let lines = 0;
		for (const entry of entries) {
			if (entry.arrivalTimeMs > arrivalBound) ctx.addIssue({
				code: "custom",
				message: `${kind} ${entry.id} arrives after the run arrival bound`
			});
			lines += entry.lines.length;
			for (const line of entry.lines) if (!productsById.has(line.productId)) ctx.addIssue({
				code: "custom",
				message: `${kind} ${entry.id} references unknown product ${line.productId}`
			});
		}
		return lines;
	};
	const orderLines = checkSchedule(s.orderSchedule, "order");
	const deliveryLines = checkSchedule(s.deliverySchedule, "delivery");
	if (orderLines > 4096) ctx.addIssue({
		code: "custom",
		message: `too many order lines: ${orderLines}`
	});
	if (deliveryLines > 4096) ctx.addIssue({
		code: "custom",
		message: `too many delivery lines: ${deliveryLines}`
	});
});
function parseOperationsScenario(json) {
	return operationsScenarioSchema.parse(json);
}
// packages/simulation/src/priorities.ts
var EVENT_PRIORITY = {
	COMPLETION: 0,
	ARRIVAL: 10,
	DISPATCH: 20,
	START: 30
};
Object.freeze(EVENT_PRIORITY);
// packages/simulation/src/inventory.ts
function assertId$1(value, what) {
	if (typeof value !== "string" || value.length < 1 || value.length > 128) throw new Error(`${what} must be a 1..128 character string`);
	return value;
}
function assertTimeMs$1(value, what) {
	if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) throw new Error(`${what} must be a safe integer in 0..${MAX_TIME_MS}`);
	return value;
}
function assertQuantity(value, what) {
	if (!Number.isSafeInteger(value) || value < 1 || value > 1e6) throw new Error(`${what} must be a safe integer in 1..${MAX_QUANTITY$1}`);
	return value;
}
function freezeDeep$3(value) {
	if (Array.isArray(value)) {
		for (const item of value) freezeDeep$3(item);
		return Object.freeze(value);
	}
	if (typeof value === "object" && value !== null) {
		for (const key of Object.keys(value)) freezeDeep$3(value[key]);
		return Object.freeze(value);
	}
	return value;
}
function createInventoryStore(scenario) {
	const products = /* @__PURE__ */ new Map();
	for (const p of scenario.products) products.set(p.id, {
		handlingClass: p.handlingClass,
		costUnits: p.capacityCostUnits,
		dims: { ...p.itemDimensionsMm }
	});
	const locations = /* @__PURE__ */ new Map();
	for (const l of scenario.locations) locations.set(l.id, {
		maxQuantity: l.maxQuantity,
		handlingClasses: [...l.restrictions.eligibleHandlingClasses],
		productIds: l.restrictions.eligibleProductIds ? [...l.restrictions.eligibleProductIds] : null,
		usable: { ...l.usableDimensionsMm }
	});
	const home = /* @__PURE__ */ new Map();
	for (const h of scenario.homeAssignments ?? []) home.set(h.productId, h.locationId);
	const units = /* @__PURE__ */ new Map();
	for (const u of scenario.mobileUnits) units.set(u.id, {
		role: u.role,
		loadCapacityUnits: u.loadCapacityUnits,
		handlingClasses: [...u.eligibleHandlingClasses]
	});
	const receivingCap = /* @__PURE__ */ new Map();
	const packingCap = /* @__PURE__ */ new Map();
	for (const r of scenario.resources) {
		if (r.kind === "receiving") receivingCap.set(r.id, r.outputStagingCapacity);
		if (r.kind === "packing") packingCap.set(r.id, r.inputStagingCapacity);
	}
	const orders = /* @__PURE__ */ new Map();
	for (const o of scenario.orderSchedule) {
		const merged = /* @__PURE__ */ new Map();
		for (const l of o.lines) merged.set(l.productId, (merged.get(l.productId) ?? 0) + l.quantity);
		orders.set(o.id, [...merged.entries()].map(([productId, quantity]) => ({
			productId,
			quantity
		})));
	}
	const storage = /* @__PURE__ */ new Map();
	for (const id of locations.keys()) storage.set(id, {
		productId: null,
		quantity: 0
	});
	const initialTotals = /* @__PURE__ */ new Map();
	for (const s of scenario.initialStock) {
		const slot = storage.get(s.locationId);
		if (!slot) throw new Error(`initial stock references unknown location ${s.locationId}`);
		slot.productId = s.productId;
		slot.quantity = s.quantity;
		initialTotals.set(s.productId, (initialTotals.get(s.productId) ?? 0) + s.quantity);
	}
	const receiving = /* @__PURE__ */ new Map();
	const carried = /* @__PURE__ */ new Map();
	for (const id of units.keys()) carried.set(id, {
		owner: null,
		loads: /* @__PURE__ */ new Map()
	});
	const packing = /* @__PURE__ */ new Map();
	const packed = /* @__PURE__ */ new Map();
	const dispatched = /* @__PURE__ */ new Map();
	const external = /* @__PURE__ */ new Map();
	for (const d of scenario.deliverySchedule) {
		const lines = /* @__PURE__ */ new Map();
		for (const l of d.lines) lines.set(l.productId, (lines.get(l.productId) ?? 0) + l.quantity);
		external.set(d.id, lines);
	}
	const accepted = /* @__PURE__ */ new Map();
	const reservations = /* @__PURE__ */ new Map();
	const progress = /* @__PURE__ */ new Map();
	const transfers = [];
	let seq = 0;
	const processed = /* @__PURE__ */ new Map();
	const costOf = (productId, quantity) => (products.get(productId)?.costUnits ?? 0) * quantity;
	const carriedUnits = (unitId) => {
		let total = 0;
		for (const [pid, qty] of carried.get(unitId)?.loads ?? []) total += costOf(pid, qty);
		return total;
	};
	const receivingUnits = (resourceId) => {
		let total = 0;
		for (const byDelivery of receiving.get(resourceId)?.values() ?? []) for (const [pid, qty] of byDelivery) total += costOf(pid, qty);
		return total;
	};
	const progressLine = (orderId, productId) => ({
		picked: progress.get(orderId)?.get(productId)?.picked ?? 0,
		packed: progress.get(orderId)?.get(productId)?.packed ?? 0,
		dispatched: progress.get(orderId)?.get(productId)?.dispatched ?? 0
	});
	const addProgress = (orderId, productId, field, quantity) => {
		let byOrder = progress.get(orderId);
		if (!byOrder) {
			byOrder = /* @__PURE__ */ new Map();
			progress.set(orderId, byOrder);
		}
		const line = byOrder.get(productId) ?? {
			picked: 0,
			packed: 0,
			dispatched: 0
		};
		line[field] += quantity;
		byOrder.set(productId, line);
	};
	const packingUnits = (resourceId) => {
		let total = 0;
		for (const byOrder of packing.get(resourceId)?.values() ?? []) for (const [pid, qty] of byOrder) total += costOf(pid, qty);
		return total;
	};
	const reservedAt = (locationId, productId) => {
		let total = 0;
		for (const lines of reservations.values()) {
			const line = lines.get(productId);
			if (line) total += line.sources.get(locationId) ?? 0;
		}
		return total;
	};
	const reservedProduct = (productId) => {
		let total = 0;
		for (const lines of reservations.values()) {
			const line = lines.get(productId);
			if (line) for (const qty of line.sources.values()) total += qty;
		}
		return total;
	};
	const storedProduct = (productId) => {
		let total = 0;
		for (const slot of storage.values()) if (slot.productId === productId) total += slot.quantity;
		return total;
	};
	const locationEligible = (locationId, productId) => {
		const loc = locations.get(locationId);
		const product = products.get(productId);
		if (!loc || !product) return "unknown location or product";
		if (!loc.handlingClasses.includes(product.handlingClass)) return `handling class ${product.handlingClass} ineligible at ${locationId}`;
		if (loc.productIds && !loc.productIds.includes(productId)) return `product ${productId} restricted from ${locationId}`;
		if (product.dims.width > loc.usable.width || product.dims.depth > loc.usable.depth || product.dims.height > loc.usable.height) return `product ${productId} item dimensions exceed ${locationId} usable dimensions`;
		return null;
	};
	const record = (eventId, timeMs, productId, quantity, from, to, owner) => {
		seq += 1;
		transfers.push({
			seq,
			eventId,
			timeMs,
			productId,
			quantity,
			from,
			to,
			owner
		});
	};
	const gate = (op, eventId, request, run) => {
		const key = JSON.stringify(request);
		const prior = processed.get(eventId);
		if (prior) {
			if (prior.op !== op || prior.request !== key) throw new Error(`duplicate event id with different payload: ${eventId}`);
			return JSON.parse(JSON.stringify(prior.result));
		}
		const result = run();
		processed.set(eventId, {
			op,
			request: key,
			result: JSON.parse(JSON.stringify(result))
		});
		return result;
	};
	const orderOwner = (orderId) => `order:${orderId}`;
	const deliveryOwner = (deliveryId) => `delivery:${deliveryId}`;
	const sourceOrder = (productId) => {
		const ids = [...locations.keys()].sort();
		const h = home.get(productId);
		if (h && ids.includes(h)) return [h, ...ids.filter((id) => id !== h)];
		return ids;
	};
	const store = {
		acceptInbound: (cmd) => gate("acceptInbound", cmd.eventId, cmd, () => {
			const eventId = assertId$1(cmd.eventId, "eventId");
			const timeMs = assertTimeMs$1(cmd.timeMs, "timeMs");
			const deliveryId = assertId$1(cmd.deliveryId, "deliveryId");
			const resourceId = assertId$1(cmd.resourceId, "resourceId");
			const productId = assertId$1(cmd.productId, "productId");
			const quantity = assertQuantity(cmd.quantity, "quantity");
			if (!products.get(productId)) throw new Error(`unknown product ${productId}`);
			const cap = receivingCap.get(resourceId);
			if (cap === void 0) throw new Error(`unknown receiving resource ${resourceId}`);
			const pending = external.get(deliveryId)?.get(productId) ?? 0;
			if (!external.has(deliveryId)) throw new Error(`unknown delivery ${deliveryId}`);
			if (pending < quantity) throw new Error(`delivery ${deliveryId} has only ${pending} of ${productId} pending, cannot accept ${quantity}`);
			const after = receivingUnits(resourceId) + costOf(productId, quantity);
			if (after > cap) throw new Error(`receiving ${resourceId} staging ${after}/${cap} handling-cost units over capacity`);
			external.get(deliveryId)?.set(productId, pending - quantity);
			let byResource = receiving.get(resourceId);
			if (!byResource) {
				byResource = /* @__PURE__ */ new Map();
				receiving.set(resourceId, byResource);
			}
			const byDelivery = byResource.get(deliveryId) ?? /* @__PURE__ */ new Map();
			byDelivery.set(productId, (byDelivery.get(productId) ?? 0) + quantity);
			byResource.set(deliveryId, byDelivery);
			accepted.set(productId, (accepted.get(productId) ?? 0) + quantity);
			record(eventId, timeMs, productId, quantity, `external:${deliveryId}`, `receiving:${resourceId}`, deliveryOwner(deliveryId));
			return {
				status: "accepted",
				deliveryId,
				productId,
				quantity
			};
		}),
		collectPutAway: (cmd) => gate("collectPutAway", cmd.eventId, cmd, () => {
			const eventId = assertId$1(cmd.eventId, "eventId");
			const timeMs = assertTimeMs$1(cmd.timeMs, "timeMs");
			const deliveryId = assertId$1(cmd.deliveryId, "deliveryId");
			const resourceId = assertId$1(cmd.resourceId, "resourceId");
			const unitId = assertId$1(cmd.unitId, "unitId");
			const productId = assertId$1(cmd.productId, "productId");
			const quantity = assertQuantity(cmd.quantity, "quantity");
			const product = products.get(productId);
			if (!product) throw new Error(`unknown product ${productId}`);
			if (!receivingCap.has(resourceId)) throw new Error(`unknown receiving resource ${resourceId}`);
			if (!external.has(deliveryId)) throw new Error(`unknown delivery ${deliveryId}`);
			const unit = units.get(unitId);
			if (!unit) throw new Error(`unknown unit ${unitId}`);
			if (unit.role !== "putaway") throw new Error(`unit ${unitId} role ${unit.role} cannot collect put-away`);
			if (!unit.handlingClasses.includes(product.handlingClass)) throw new Error(`unit ${unitId} ineligible for handling class ${product.handlingClass}`);
			const staged = receiving.get(resourceId)?.get(deliveryId)?.get(productId) ?? 0;
			if (staged < quantity) throw new Error(`receiving ${resourceId} holds only ${staged} of ${productId} for delivery ${deliveryId}, cannot collect ${quantity}`);
			const load = carried.get(unitId);
			if (!load) throw new Error(`unknown unit ${unitId}`);
			const owner = deliveryOwner(deliveryId);
			if (load.owner !== null && load.owner !== owner) throw new Error(`unit ${unitId} is committed to ${load.owner}, cannot collect for ${owner}`);
			const after = carriedUnits(unitId) + costOf(productId, quantity);
			if (after > unit.loadCapacityUnits) throw new Error(`unit ${unitId} load ${after}/${unit.loadCapacityUnits} handling-cost units over capacity`);
			receiving.get(resourceId)?.get(deliveryId)?.set(productId, staged - quantity);
			load.owner = owner;
			load.loads.set(productId, (load.loads.get(productId) ?? 0) + quantity);
			record(eventId, timeMs, productId, quantity, `receiving:${resourceId}`, `carried:${unitId}`, owner);
			return {
				status: "collected",
				unitId,
				productId,
				quantity
			};
		}),
		placePutAway: (cmd) => gate("placePutAway", cmd.eventId, cmd, () => {
			const eventId = assertId$1(cmd.eventId, "eventId");
			const timeMs = assertTimeMs$1(cmd.timeMs, "timeMs");
			const deliveryId = assertId$1(cmd.deliveryId, "deliveryId");
			const unitId = assertId$1(cmd.unitId, "unitId");
			const locationId = assertId$1(cmd.locationId, "locationId");
			const productId = assertId$1(cmd.productId, "productId");
			const quantity = assertQuantity(cmd.quantity, "quantity");
			if (!products.has(productId)) throw new Error(`unknown product ${productId}`);
			const slot = storage.get(locationId);
			const info = locations.get(locationId);
			if (!slot || !info) throw new Error(`unknown location ${locationId}`);
			const load = carried.get(unitId);
			if (!load) throw new Error(`unknown unit ${unitId}`);
			const owner = deliveryOwner(deliveryId);
			if (load.owner !== owner) throw new Error(`unit ${unitId} carries nothing for ${owner}`);
			if ((load.loads.get(productId) ?? 0) < quantity) throw new Error(`unit ${unitId} carries insufficient ${productId} for ${owner}`);
			const blocker = locationEligible(locationId, productId);
			if (blocker) throw new Error(`cannot store ${productId} at ${locationId}: ${blocker}`);
			if (slot.productId !== null && slot.productId !== productId) throw new Error(`location ${locationId} holds ${slot.productId}, one product per slot`);
			if (slot.quantity + quantity > info.maxQuantity) throw new Error(`location ${locationId} ${slot.quantity}+${quantity} exceeds maxQuantity ${info.maxQuantity}`);
			load.loads.set(productId, (load.loads.get(productId) ?? 0) - quantity);
			if ([...load.loads.values()].every((q) => q === 0)) {
				load.loads.clear();
				load.owner = null;
			}
			slot.productId = productId;
			slot.quantity += quantity;
			record(eventId, timeMs, productId, quantity, `carried:${unitId}`, `storage:${locationId}`, owner);
			return {
				status: "stored",
				locationId,
				productId,
				quantity
			};
		}),
		selectPutAwayLocation: (productId, quantity) => {
			assertId$1(productId, "productId");
			assertQuantity(quantity, "quantity");
			if (!products.has(productId)) throw new Error(`unknown product ${productId}`);
			const blockers = [];
			for (const locationId of sourceOrder(productId)) {
				const info = locations.get(locationId);
				const slot = storage.get(locationId);
				if (!info || !slot) continue;
				const blocker = locationEligible(locationId, productId);
				if (blocker) {
					blockers.push(`${locationId}: ${blocker}`);
					continue;
				}
				if (slot.productId !== null && slot.productId !== productId) {
					blockers.push(`${locationId}: holds ${slot.productId}`);
					continue;
				}
				if (slot.quantity + quantity > info.maxQuantity) {
					blockers.push(`${locationId}: ${slot.quantity}+${quantity} exceeds maxQuantity ${info.maxQuantity}`);
					continue;
				}
				return {
					status: "selectable",
					locationId
				};
			}
			return {
				status: "blocked",
				reason: blockers.join("; ") || "no locations configured"
			};
		},
		reserveOrder: (cmd) => gate("reserveOrder", cmd.eventId, cmd, () => {
			assertId$1(cmd.eventId, "eventId");
			assertTimeMs$1(cmd.timeMs, "timeMs");
			const orderId = assertId$1(cmd.orderId, "orderId");
			const lines = orders.get(orderId);
			if (!lines) throw new Error(`unknown order ${orderId}`);
			const existing = reservations.get(orderId);
			if (existing) {
				const replay = [];
				for (const [productId, line] of [...existing.entries()].sort(([a], [b]) => a < b ? -1 : 1)) for (const [locationId, remaining] of [...line.sources.entries()].sort(([a], [b]) => a < b ? -1 : 1)) replay.push({
					productId,
					locationId,
					quantity: remaining
				});
				return {
					status: "reserved",
					orderId,
					sources: replay
				};
			}
			const remainingNeed = /* @__PURE__ */ new Map();
			for (const line of lines) {
				const picked = progressLine(orderId, line.productId).picked;
				if (picked > line.quantity) throw new Error(`order ${orderId} ${line.productId} picked ${picked} exceeds requested ${line.quantity}`);
				remainingNeed.set(line.productId, line.quantity - picked);
			}
			if ([...remainingNeed.values()].every((need) => need === 0)) throw new Error(`order ${orderId} already fulfilled, cannot reserve`);
			const shortages = [];
			for (const line of lines) {
				const need = remainingNeed.get(line.productId) ?? 0;
				if (need === 0) continue;
				const availableQty = storedProduct(line.productId) - reservedProduct(line.productId);
				if (availableQty < need) shortages.push({
					productId: line.productId,
					requested: need,
					available: availableQty
				});
			}
			if (shortages.length > 0) return {
				status: "waiting",
				orderId,
				reason: "WAITING_FOR_STOCK",
				shortages
			};
			const plan = /* @__PURE__ */ new Map();
			for (const line of lines) {
				let need = remainingNeed.get(line.productId) ?? 0;
				if (need === 0) continue;
				const alloc = /* @__PURE__ */ new Map();
				for (const locationId of sourceOrder(line.productId)) {
					if (need <= 0) break;
					const slot = storage.get(locationId);
					if (!slot || slot.productId !== line.productId) continue;
					const free = slot.quantity - reservedAt(locationId, line.productId);
					if (free <= 0) continue;
					const take = Math.min(free, need);
					alloc.set(locationId, take);
					need -= take;
				}
				if (need > 0) throw new Error(`reservation plan short for ${line.productId}: missing ${need}`);
				plan.set(line.productId, alloc);
			}
			const byProduct = /* @__PURE__ */ new Map();
			const sources = [];
			for (const line of lines) {
				const alloc = plan.get(line.productId);
				if (!alloc) continue;
				byProduct.set(line.productId, {
					requested: remainingNeed.get(line.productId) ?? 0,
					picked: 0,
					sources: alloc
				});
				for (const [locationId, qty] of [...alloc.entries()].sort(([a], [b]) => a < b ? -1 : 1)) sources.push({
					productId: line.productId,
					locationId,
					quantity: qty
				});
			}
			reservations.set(orderId, byProduct);
			return {
				status: "reserved",
				orderId,
				sources
			};
		}),
		pick: (cmd) => gate("pick", cmd.eventId, cmd, () => {
			const eventId = assertId$1(cmd.eventId, "eventId");
			const timeMs = assertTimeMs$1(cmd.timeMs, "timeMs");
			const orderId = assertId$1(cmd.orderId, "orderId");
			const unitId = assertId$1(cmd.unitId, "unitId");
			const locationId = assertId$1(cmd.locationId, "locationId");
			const productId = assertId$1(cmd.productId, "productId");
			const quantity = assertQuantity(cmd.quantity, "quantity");
			const product = products.get(productId);
			if (!product) throw new Error(`unknown product ${productId}`);
			const unit = units.get(unitId);
			if (!unit) throw new Error(`unknown unit ${unitId}`);
			if (unit.role !== "picker") throw new Error(`unit ${unitId} role ${unit.role} cannot pick orders`);
			if (!unit.handlingClasses.includes(product.handlingClass)) throw new Error(`unit ${unitId} ineligible for handling class ${product.handlingClass}`);
			const slot = storage.get(locationId);
			if (!slot) throw new Error(`unknown location ${locationId}`);
			const line = reservations.get(orderId)?.get(productId);
			if (!line) throw new Error(`order ${orderId} holds no reservation for ${productId}`);
			const requested = orders.get(orderId)?.find((l) => l.productId === productId)?.quantity ?? 0;
			const alreadyPicked = progressLine(orderId, productId).picked;
			if (alreadyPicked + quantity > requested) throw new Error(`order ${orderId} ${productId} picked ${alreadyPicked}/${requested}, cannot pick ${quantity} more`);
			const remaining = line.sources.get(locationId) ?? 0;
			if (remaining < quantity) throw new Error(`order ${orderId} reserved only ${remaining} of ${productId} at ${locationId}, cannot pick ${quantity}`);
			if (slot.productId !== productId || slot.quantity < quantity) throw new Error(`storage ${locationId} holds insufficient ${productId}`);
			const load = carried.get(unitId);
			if (!load) throw new Error(`unknown unit ${unitId}`);
			const owner = orderOwner(orderId);
			if (load.owner !== null && load.owner !== owner) throw new Error(`unit ${unitId} is committed to ${load.owner}, cannot pick for ${owner}`);
			const after = carriedUnits(unitId) + costOf(productId, quantity);
			if (after > unit.loadCapacityUnits) throw new Error(`unit ${unitId} load ${after}/${unit.loadCapacityUnits} handling-cost units over capacity`);
			slot.quantity -= quantity;
			if (slot.quantity === 0) slot.productId = null;
			line.sources.set(locationId, remaining - quantity);
			line.picked += quantity;
			addProgress(orderId, productId, "picked", quantity);
			load.owner = owner;
			load.loads.set(productId, (load.loads.get(productId) ?? 0) + quantity);
			record(eventId, timeMs, productId, quantity, `storage:${locationId}`, `carried:${unitId}`, owner);
			return {
				status: "picked",
				orderId,
				productId,
				quantity
			};
		}),
		cancelReservation: (cmd) => gate("cancelReservation", cmd.eventId, cmd, () => {
			assertId$1(cmd.eventId, "eventId");
			assertTimeMs$1(cmd.timeMs, "timeMs");
			const orderId = assertId$1(cmd.orderId, "orderId");
			const lines = reservations.get(orderId);
			if (!lines) throw new Error(`unknown reservation for order ${orderId}`);
			reservations.delete(orderId);
			return {
				status: "cancelled",
				orderId,
				releasedLines: lines.size
			};
		}),
		transferToPacking: (cmd) => gate("transferToPacking", cmd.eventId, cmd, () => {
			const eventId = assertId$1(cmd.eventId, "eventId");
			const timeMs = assertTimeMs$1(cmd.timeMs, "timeMs");
			const orderId = assertId$1(cmd.orderId, "orderId");
			const unitId = assertId$1(cmd.unitId, "unitId");
			const resourceId = assertId$1(cmd.resourceId, "resourceId");
			const productId = assertId$1(cmd.productId, "productId");
			const quantity = assertQuantity(cmd.quantity, "quantity");
			if (!products.has(productId)) throw new Error(`unknown product ${productId}`);
			const cap = packingCap.get(resourceId);
			if (cap === void 0) throw new Error(`unknown packing resource ${resourceId}`);
			const load = carried.get(unitId);
			if (!load) throw new Error(`unknown unit ${unitId}`);
			const owner = orderOwner(orderId);
			if (load.owner !== owner) throw new Error(`unit ${unitId} carries nothing for ${owner}`);
			if ((load.loads.get(productId) ?? 0) < quantity) throw new Error(`unit ${unitId} carries insufficient ${productId} for ${owner}`);
			const after = packingUnits(resourceId) + costOf(productId, quantity);
			if (after > cap) throw new Error(`packing ${resourceId} staging ${after}/${cap} handling-cost units over capacity`);
			load.loads.set(productId, (load.loads.get(productId) ?? 0) - quantity);
			if ([...load.loads.values()].every((q) => q === 0)) {
				load.loads.clear();
				load.owner = null;
			}
			const byResource = packing.get(resourceId) ?? /* @__PURE__ */ new Map();
			const byOrder = byResource.get(orderId) ?? /* @__PURE__ */ new Map();
			byOrder.set(productId, (byOrder.get(productId) ?? 0) + quantity);
			byResource.set(orderId, byOrder);
			packing.set(resourceId, byResource);
			record(eventId, timeMs, productId, quantity, `carried:${unitId}`, `packing:${resourceId}:${orderId}`, owner);
			return {
				status: "staged",
				orderId,
				productId,
				quantity
			};
		}),
		packingReadiness: (orderId, resourceId) => {
			assertId$1(orderId, "orderId");
			assertId$1(resourceId, "resourceId");
			const lines = orders.get(orderId);
			if (!lines) throw new Error(`unknown order ${orderId}`);
			if (!packingCap.has(resourceId)) throw new Error(`unknown packing resource ${resourceId}`);
			const stagedAt = packing.get(resourceId)?.get(orderId) ?? /* @__PURE__ */ new Map();
			const requested = lines.map((l) => ({
				productId: l.productId,
				quantity: l.quantity
			}));
			const staged = lines.map((l) => ({
				productId: l.productId,
				quantity: stagedAt.get(l.productId) ?? 0
			}));
			const remaining = lines.map((l) => ({
				productId: l.productId,
				quantity: l.quantity - (stagedAt.get(l.productId) ?? 0)
			})).filter((l) => l.quantity > 0);
			return {
				ready: remaining.length === 0,
				requested,
				staged,
				remaining
			};
		},
		packOrder: (cmd) => gate("packOrder", cmd.eventId, cmd, () => {
			const eventId = assertId$1(cmd.eventId, "eventId");
			const timeMs = assertTimeMs$1(cmd.timeMs, "timeMs");
			const orderId = assertId$1(cmd.orderId, "orderId");
			const resourceId = assertId$1(cmd.resourceId, "resourceId");
			const lines = orders.get(orderId);
			if (!lines) throw new Error(`unknown order ${orderId}`);
			if (!packingCap.has(resourceId)) throw new Error(`unknown packing resource ${resourceId}`);
			const stagedAt = packing.get(resourceId)?.get(orderId) ?? /* @__PURE__ */ new Map();
			for (const line of lines) {
				const have = stagedAt.get(line.productId) ?? 0;
				if (have < line.quantity) throw new Error(`order ${orderId} not ready at ${resourceId}: ${line.productId} staged ${have}/${line.quantity}`);
				const packedSoFar = progressLine(orderId, line.productId).packed;
				if (packedSoFar + line.quantity > line.quantity) throw new Error(`order ${orderId} ${line.productId} already packed ${packedSoFar}/${line.quantity}, cannot pack again`);
			}
			const out = packed.get(orderId) ?? /* @__PURE__ */ new Map();
			for (const line of lines) {
				stagedAt.set(line.productId, (stagedAt.get(line.productId) ?? 0) - line.quantity);
				out.set(line.productId, (out.get(line.productId) ?? 0) + line.quantity);
				addProgress(orderId, line.productId, "packed", line.quantity);
				record(eventId, timeMs, line.productId, line.quantity, `packing:${resourceId}:${orderId}`, `packed:${orderId}`, orderOwner(orderId));
			}
			packed.set(orderId, out);
			return {
				status: "packed",
				orderId
			};
		}),
		dispatchOrder: (cmd) => gate("dispatchOrder", cmd.eventId, cmd, () => {
			const eventId = assertId$1(cmd.eventId, "eventId");
			const timeMs = assertTimeMs$1(cmd.timeMs, "timeMs");
			const orderId = assertId$1(cmd.orderId, "orderId");
			const lines = orders.get(orderId);
			if (!lines) throw new Error(`unknown order ${orderId}`);
			const have = packed.get(orderId) ?? /* @__PURE__ */ new Map();
			for (const line of lines) {
				if ((have.get(line.productId) ?? 0) < line.quantity) throw new Error(`order ${orderId} packed insufficient ${line.productId}, cannot dispatch`);
				const dispatchedSoFar = progressLine(orderId, line.productId).dispatched;
				if (dispatchedSoFar + line.quantity > line.quantity) throw new Error(`order ${orderId} ${line.productId} already dispatched ${dispatchedSoFar}/${line.quantity}, cannot dispatch again`);
			}
			const out = dispatched.get(orderId) ?? /* @__PURE__ */ new Map();
			for (const line of lines) {
				have.set(line.productId, (have.get(line.productId) ?? 0) - line.quantity);
				out.set(line.productId, (out.get(line.productId) ?? 0) + line.quantity);
				addProgress(orderId, line.productId, "dispatched", line.quantity);
				record(eventId, timeMs, line.productId, line.quantity, `packed:${orderId}`, `dispatched:${orderId}`, orderOwner(orderId));
			}
			packed.set(orderId, have);
			dispatched.set(orderId, out);
			return {
				status: "dispatched",
				orderId
			};
		}),
		available: (productId) => {
			assertId$1(productId, "productId");
			if (!products.has(productId)) throw new Error(`unknown product ${productId}`);
			const stored = storedProduct(productId);
			const reserved = reservedProduct(productId);
			return {
				stored,
				reserved,
				available: stored - reserved
			};
		},
		bucketTotals: (productId) => {
			assertId$1(productId, "productId");
			if (!products.has(productId)) throw new Error(`unknown product ${productId}`);
			let receivingQty = 0;
			for (const byResource of receiving.values()) for (const byDelivery of byResource.values()) receivingQty += byDelivery.get(productId) ?? 0;
			let carriedQty = 0;
			for (const load of carried.values()) carriedQty += load.loads.get(productId) ?? 0;
			let packingQty = 0;
			for (const byResource of packing.values()) for (const byOrder of byResource.values()) packingQty += byOrder.get(productId) ?? 0;
			let packedQty = 0;
			for (const byOrder of packed.values()) packedQty += byOrder.get(productId) ?? 0;
			let dispatchedQty = 0;
			for (const byOrder of dispatched.values()) dispatchedQty += byOrder.get(productId) ?? 0;
			let pending = 0;
			for (const lines of external.values()) pending += lines.get(productId) ?? 0;
			return {
				receiving: receivingQty,
				storage: storedProduct(productId),
				carried: carriedQty,
				packing: packingQty,
				packed: packedQty,
				dispatched: dispatchedQty,
				externalPending: pending
			};
		},
		checkInvariants: () => {
			const violations = [];
			const nonNeg = (value, what) => {
				if (!Number.isSafeInteger(value) || value < 0) violations.push(`negative ${what}: ${value}`);
			};
			for (const [locationId, slot] of storage) {
				nonNeg(slot.quantity, `storage ${locationId}`);
				if (slot.productId === null && slot.quantity !== 0) violations.push(`storage ${locationId} has quantity without product`);
				const info = locations.get(locationId);
				if (info && slot.quantity > info.maxQuantity) violations.push(`storage ${locationId} exceeds maxQuantity`);
			}
			for (const [unitId, load] of carried) {
				const unit = units.get(unitId);
				let unitsUsed = 0;
				for (const [pid, qty] of load.loads) {
					nonNeg(qty, `carried ${unitId} ${pid}`);
					unitsUsed += costOf(pid, qty);
				}
				if (unit && unitsUsed > unit.loadCapacityUnits) violations.push(`unit ${unitId} over load capacity`);
				if (load.owner === null && load.loads.size > 0) violations.push(`unit ${unitId} loaded without owner`);
			}
			for (const [resourceId, cap] of receivingCap) {
				if (receivingUnits(resourceId) > cap) violations.push(`receiving ${resourceId} over staging capacity`);
				for (const [deliveryId, byDelivery] of receiving.get(resourceId) ?? []) for (const [pid, qty] of byDelivery) nonNeg(qty, `receiving ${resourceId} ${deliveryId} ${pid}`);
			}
			for (const [resourceId, cap] of packingCap) if (packingUnits(resourceId) > cap) violations.push(`packing ${resourceId} over staging capacity`);
			for (const productId of products.keys()) {
				const t = store.bucketTotals(productId);
				const physical = t.receiving + t.storage + t.carried + t.packing + t.packed + t.dispatched;
				const expected = (initialTotals.get(productId) ?? 0) + (accepted.get(productId) ?? 0);
				if (physical !== expected) violations.push(`conservation ${productId}: physical ${physical} != initial+accepted ${expected}`);
				if (reservedProduct(productId) > storedProduct(productId)) violations.push(`reserved exceeds stored for ${productId}`);
			}
			for (const [orderId, lines] of reservations) for (const [productId, line] of lines) {
				let remaining = 0;
				for (const [locationId, qty] of line.sources) {
					nonNeg(qty, `reservation ${orderId} ${productId} ${locationId}`);
					remaining += qty;
					if (qty === 0) continue;
					const slot = storage.get(locationId);
					if (!slot || slot.productId !== productId || slot.quantity < qty) violations.push(`reservation ${orderId} ${productId} at ${locationId} exceeds physical stock`);
				}
				if (line.picked + remaining !== line.requested) violations.push(`reservation ${orderId} ${productId} picked+remaining != requested`);
			}
			for (const [orderId, demandLines] of orders) {
				const outstanding = reservations.get(orderId);
				const owner = orderOwner(orderId);
				for (const demand of demandLines) {
					const hist = progressLine(orderId, demand.productId);
					if (hist.picked > demand.quantity) violations.push(`order ${orderId} ${demand.productId} picked ${hist.picked} exceeds requested ${demand.quantity}`);
					if (hist.packed > demand.quantity) violations.push(`order ${orderId} ${demand.productId} packed ${hist.packed} exceeds requested ${demand.quantity}`);
					if (hist.dispatched > demand.quantity) violations.push(`order ${orderId} ${demand.productId} dispatched ${hist.dispatched} exceeds requested ${demand.quantity}`);
					let remaining = 0;
					for (const qty of outstanding?.get(demand.productId)?.sources.values() ?? []) remaining += qty;
					if (hist.picked + remaining > demand.quantity) violations.push(`order ${orderId} ${demand.productId} picked+outstanding ${hist.picked + remaining} exceeds requested ${demand.quantity}`);
					let carriedFor = 0;
					for (const load of carried.values()) if (load.owner === owner) carriedFor += load.loads.get(demand.productId) ?? 0;
					let packingFor = 0;
					for (const byResource of packing.values()) packingFor += byResource.get(orderId)?.get(demand.productId) ?? 0;
					const packedFor = packed.get(orderId)?.get(demand.productId) ?? 0;
					const dispatchedFor = dispatched.get(orderId)?.get(demand.productId) ?? 0;
					const physicalFor = carriedFor + packingFor + packedFor + dispatchedFor;
					if (physicalFor !== hist.picked) violations.push(`order ${orderId} ${demand.productId} physical ${physicalFor} != picked ${hist.picked}`);
					if (packedFor + dispatchedFor !== hist.packed) violations.push(`order ${orderId} ${demand.productId} packed+dispatched physical ${packedFor + dispatchedFor} != packed ${hist.packed}`);
					if (dispatchedFor !== hist.dispatched) violations.push(`order ${orderId} ${demand.productId} dispatched physical ${dispatchedFor} != dispatched ${hist.dispatched}`);
				}
			}
			return violations;
		},
		snapshot: () => {
			return freezeDeep$3({
				storage: [...storage.entries()].map(([locationId, slot]) => ({
					locationId,
					productId: slot.productId,
					quantity: slot.quantity
				})).sort((a, b) => a.locationId < b.locationId ? -1 : 1),
				receiving: [...receiving.entries()].flatMap(([resourceId, byResource]) => [...byResource.entries()].flatMap(([deliveryId, byDelivery]) => [...byDelivery.entries()].map(([productId, quantity]) => ({
					resourceId,
					deliveryId,
					productId,
					quantity
				})))).sort((a, b) => a.resourceId + a.deliveryId + a.productId < b.resourceId + b.deliveryId + b.productId ? -1 : 1),
				carried: [...carried.entries()].map(([unitId, load]) => ({
					unitId,
					owner: load.owner,
					loads: [...load.loads.entries()].map(([productId, quantity]) => ({
						productId,
						quantity
					})).sort((a, b) => a.productId < b.productId ? -1 : 1)
				})).sort((a, b) => a.unitId < b.unitId ? -1 : 1),
				packing: [...packing.entries()].flatMap(([resourceId, byResource]) => [...byResource.entries()].flatMap(([orderId, byOrder]) => [...byOrder.entries()].map(([productId, quantity]) => ({
					resourceId,
					orderId,
					productId,
					quantity
				})))).sort((a, b) => a.resourceId + a.orderId + a.productId < b.resourceId + b.orderId + b.productId ? -1 : 1),
				packed: [...packed.entries()].flatMap(([orderId, byOrder]) => [...byOrder.entries()].map(([productId, quantity]) => ({
					orderId,
					productId,
					quantity
				}))).sort((a, b) => a.orderId + a.productId < b.orderId + b.productId ? -1 : 1),
				dispatched: [...dispatched.entries()].flatMap(([orderId, byOrder]) => [...byOrder.entries()].map(([productId, quantity]) => ({
					orderId,
					productId,
					quantity
				}))).sort((a, b) => a.orderId + a.productId < b.orderId + b.productId ? -1 : 1),
				externalPending: [...external.entries()].flatMap(([deliveryId, lines]) => [...lines.entries()].map(([productId, quantity]) => ({
					deliveryId,
					productId,
					quantity
				}))).sort((a, b) => a.deliveryId + a.productId < b.deliveryId + b.productId ? -1 : 1),
				reservations: [...reservations.entries()].map(([orderId, lines]) => ({
					orderId,
					lines: [...lines.entries()].map(([productId, line]) => ({
						productId,
						requested: line.requested,
						picked: line.picked,
						sources: [...line.sources.entries()].map(([locationId, remaining]) => ({
							locationId,
							remaining
						})).sort((a, b) => a.locationId < b.locationId ? -1 : 1)
					})).sort((a, b) => a.productId < b.productId ? -1 : 1)
				})).sort((a, b) => a.orderId < b.orderId ? -1 : 1),
				acceptedInbound: [...accepted.entries()].map(([productId, quantity]) => ({
					productId,
					quantity
				})).sort((a, b) => a.productId < b.productId ? -1 : 1),
				fulfillment: [...progress.entries()].map(([orderId, byOrder]) => ({
					orderId,
					lines: [...byOrder.entries()].map(([productId, hist]) => ({
						productId,
						requested: orders.get(orderId)?.find((l) => l.productId === productId)?.quantity ?? 0,
						picked: hist.picked,
						packed: hist.packed,
						dispatched: hist.dispatched
					})).sort((a, b) => a.productId < b.productId ? -1 : 1)
				})).sort((a, b) => a.orderId < b.orderId ? -1 : 1),
				transfers: transfers.map((t) => ({ ...t }))
			});
		}
	};
	return store;
}
// packages/simulation/src/kernel.ts
var MAX_KERNEL_PRIORITY = 1e6;
var MAX_PLAN_VERSION = 1e9;
function compareEvents(a, b) {
	return a.timeMs - b.timeMs || a.priority - b.priority || a.sequence - b.sequence;
}
function isRecord$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
var MAX_EVENT_DATA_DEPTH = 32;
var MAX_EVENT_DATA_NODES = 1e4;
var MAX_EVENT_DATA_STRING_CHARS = 262144;
function validateEventData(data) {
	if (data === void 0 || data === null) return;
	const stack = [{
		value: data,
		depth: 0,
		exit: null
	}];
	const path = /* @__PURE__ */ new Set();
	let nodes = 0;
	let stringChars = 0;
	while (stack.length > 0) {
		const frame = stack.pop();
		if (frame.exit !== null) {
			path.delete(frame.exit);
			continue;
		}
		nodes += 1;
		if (nodes > MAX_EVENT_DATA_NODES) throw new Error(`event data exceeds ${MAX_EVENT_DATA_NODES} JSON values`);
		const v = frame.value;
		const depth = frame.depth;
		if (v === null) continue;
		const t = typeof v;
		if (t === "boolean") continue;
		if (t === "string") {
			stringChars += v.length;
			if (stringChars > MAX_EVENT_DATA_STRING_CHARS) throw new Error(`event data exceeds ${MAX_EVENT_DATA_STRING_CHARS} string characters`);
			continue;
		}
		if (t === "number") {
			if (!Number.isFinite(v)) throw new Error("event data numbers must be finite (no NaN/Infinity)");
			continue;
		}
		if (t === "bigint" || t === "function" || t === "symbol" || t === "undefined") throw new Error("event data must be plain JSON-compatible data (no bigint/function/symbol/undefined)");
		if (Array.isArray(v)) {
			if (path.has(v)) throw new Error("event data must not contain cycles");
			if (depth >= MAX_EVENT_DATA_DEPTH) throw new Error(`event data exceeds max depth ${MAX_EVENT_DATA_DEPTH}`);
			path.add(v);
			stack.push({
				value: null,
				depth: 0,
				exit: v
			});
			for (let i = v.length - 1; i >= 0; i -= 1) stack.push({
				value: v[i],
				depth: depth + 1,
				exit: null
			});
			continue;
		}
		const proto = Object.getPrototypeOf(v);
		if (proto !== Object.prototype && proto !== null) throw new Error("event data must be plain JSON objects/arrays (no Date/Map/class instances)");
		if (path.has(v)) throw new Error("event data must not contain cycles");
		if (depth >= MAX_EVENT_DATA_DEPTH) throw new Error(`event data exceeds max depth ${MAX_EVENT_DATA_DEPTH}`);
		path.add(v);
		stack.push({
			value: null,
			depth: 0,
			exit: v
		});
		const entries = Object.entries(v);
		for (let i = entries.length - 1; i >= 0; i -= 1) {
			const [key, child] = entries[i];
			stringChars += key.length;
			if (stringChars > MAX_EVENT_DATA_STRING_CHARS) throw new Error(`event data exceeds ${MAX_EVENT_DATA_STRING_CHARS} string characters`);
			stack.push({
				value: child,
				depth: depth + 1,
				exit: null
			});
		}
	}
}
function cloneData(data) {
	if (data === void 0 || data === null) return null;
	validateEventData(data);
	try {
		return structuredClone(data);
	} catch {
		throw new Error("event data must be plain JSON-compatible data");
	}
}
function freezeDeep$2(value, seen) {
	const guard = seen ?? /* @__PURE__ */ new WeakSet();
	if (Array.isArray(value)) {
		if (guard.has(value)) return value;
		guard.add(value);
		for (const item of value) freezeDeep$2(item, guard);
		return Object.freeze(value);
	}
	if (isRecord$1(value)) {
		if (guard.has(value)) return value;
		guard.add(value);
		for (const key of Object.keys(value)) freezeDeep$2(value[key], guard);
		return Object.freeze(value);
	}
	return value;
}
function snapshotEventsEqual(a, b) {
	return a.id === b.id && a.timeMs === b.timeMs && a.priority === b.priority && a.sequence === b.sequence && a.kind === b.kind && a.taskId === b.taskId && a.planVersion === b.planVersion && JSON.stringify(a.data ?? null) === JSON.stringify(b.data ?? null);
}
function createKernel(options) {
	if (!isRecord$1(options)) throw new Error("kernel options must be an object");
	const { maxProcessedEvents, maxEventsPerTimestamp, onEvent } = options;
	if (!Number.isSafeInteger(maxProcessedEvents) || maxProcessedEvents < 1) throw new Error("maxProcessedEvents must be a positive safe integer");
	if (!Number.isSafeInteger(maxEventsPerTimestamp) || maxEventsPerTimestamp < 1) throw new Error("maxEventsPerTimestamp must be a positive safe integer");
	if (typeof onEvent !== "function") throw new Error("onEvent must be a function");
	let clockMs = 0;
	let nextSequence = 0;
	let pending = [];
	let idsEver = /* @__PURE__ */ new Set();
	let processedIds = [];
	let cancelledIds = [];
	let staleSkippedIds = [];
	let taskPlanVersions = /* @__PURE__ */ new Map();
	let timestampOfCount = 0;
	let countAtTimestamp = 0;
	let invalid = false;
	let failedEvent = null;
	let diagnostic = null;
	const statusOf = () => invalid ? "invalid" : pending.length === 0 ? "queue-empty" : "ready";
	const viewOf = (e) => ({
		id: e.id,
		timeMs: e.timeMs,
		priority: e.priority,
		sequence: e.sequence,
		kind: e.kind,
		data: cloneData(e.data),
		taskId: e.taskId,
		planVersion: e.planVersion
	});
	const insertSorted = (e) => {
		let lo = 0;
		let hi = pending.length;
		while (lo < hi) {
			const mid = lo + hi >> 1;
			if (compareEvents(pending[mid], e) < 0) lo = mid + 1;
			else hi = mid;
		}
		pending.splice(lo, 0, e);
	};
	const checkValid = (action) => {
		if (invalid) throw new Error(`cannot ${action}: kernel is invalid (${diagnostic})`);
	};
	const schedule = (input) => {
		checkValid("schedule");
		if (!isRecord$1(input)) throw new Error("event must be an object");
		const { id, timeMs, priority, kind } = input;
		if (typeof id !== "string" || id.length < 1 || id.length > 128) throw new Error("event id must be a 1..128 character string");
		if (!Number.isSafeInteger(timeMs) || timeMs < 0 || timeMs > 2147483647) throw new Error(`event ${id} has timeMs outside 0..${MAX_TIME_MS}`);
		if (!Number.isSafeInteger(priority) || priority < 0 || priority > 1e6) throw new Error(`event ${id} has priority outside 0..${MAX_KERNEL_PRIORITY}`);
		if (typeof kind !== "string" || kind.length < 1 || kind.length > 128) throw new Error(`event ${id} has an invalid kind`);
		const rawTaskId = input.taskId;
		const rawPlanVersion = input.planVersion;
		if (rawTaskId !== void 0 && (typeof rawTaskId !== "string" || rawTaskId.length < 1 || rawTaskId.length > 128)) throw new Error(`event ${id} has an invalid taskId`);
		if (rawPlanVersion !== void 0 && (!Number.isSafeInteger(rawPlanVersion) || rawPlanVersion < 0 || rawPlanVersion > 1e9)) throw new Error(`event ${id} has a planVersion outside 0..${MAX_PLAN_VERSION}`);
		if (timeMs < clockMs) throw new Error(`event ${id} is scheduled in the past`);
		if (idsEver.has(id)) throw new Error(`duplicate event id: ${id}`);
		const event = {
			id,
			timeMs,
			priority,
			sequence: nextSequence,
			kind,
			data: cloneData(input.data),
			taskId: rawTaskId ?? null,
			planVersion: rawPlanVersion ?? null
		};
		nextSequence += 1;
		idsEver.add(id);
		insertSorted(event);
		return id;
	};
	const cancel = (eventId) => {
		if (invalid) return false;
		const index = pending.findIndex((e) => e.id === eventId);
		if (index < 0) return false;
		pending.splice(index, 1);
		cancelledIds.push(eventId);
		return true;
	};
	const setTaskPlanVersion = (taskId, version) => {
		checkValid("set a task plan version");
		if (typeof taskId !== "string" || taskId.length < 1 || taskId.length > 128) throw new Error("taskId must be a 1..128 character string");
		if (!Number.isSafeInteger(version) || version < 0 || version > 1e9) throw new Error(`plan version outside 0..${MAX_PLAN_VERSION}`);
		if (version < (taskPlanVersions.get(taskId) ?? 0)) throw new Error(`plan version for task ${taskId} cannot move backward`);
		taskPlanVersions.set(taskId, version);
	};
	const invalidate = (event, reason) => {
		invalid = true;
		failedEvent = event;
		diagnostic = reason;
		return {
			status: "invalid",
			clockMs,
			processedTotal: processedIds.length,
			eventId: event.id,
			diagnostic: reason
		};
	};
	const apiFor = (now) => ({
		clockMs: now,
		schedule,
		cancel,
		setTaskPlanVersion
	});
	const stepEvent = () => {
		if (invalid) return {
			status: "invalid",
			clockMs,
			processedTotal: processedIds.length,
			eventId: failedEvent?.id ?? null,
			diagnostic
		};
		const next = pending[0];
		if (!next) return {
			status: "queue-empty",
			clockMs,
			processedTotal: processedIds.length,
			eventId: null,
			diagnostic: null
		};
		const currentVersion = next.taskId === null ? null : taskPlanVersions.get(next.taskId) ?? 0;
		if (currentVersion !== null && (next.planVersion ?? 0) < currentVersion) {
			pending.shift();
			clockMs = next.timeMs;
			staleSkippedIds.push(next.id);
			return {
				status: statusOf(),
				clockMs,
				processedTotal: processedIds.length,
				eventId: next.id,
				diagnostic: `stale event skipped: ${next.id} (task ${next.taskId} plan v${next.planVersion ?? 0} < v${currentVersion})`
			};
		}
		if (processedIds.length >= maxProcessedEvents) return invalidate(next, `processed-event bound exceeded: ${maxProcessedEvents} events already processed, cannot execute ${next.id}`);
		if ((next.timeMs === timestampOfCount ? countAtTimestamp : 0) >= maxEventsPerTimestamp) return invalidate(next, `zero-time-work bound exceeded: ${maxEventsPerTimestamp} events already executed at t=${next.timeMs}, cannot execute ${next.id}`);
		pending.shift();
		clockMs = next.timeMs;
		if (next.timeMs === timestampOfCount) countAtTimestamp += 1;
		else {
			timestampOfCount = next.timeMs;
			countAtTimestamp = 1;
		}
		processedIds.push(next.id);
		try {
			onEvent(viewOf(next), apiFor(next.timeMs));
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return invalidate(next, `handler error on ${next.id}: ${message}`);
		}
		return {
			status: statusOf(),
			clockMs,
			processedTotal: processedIds.length,
			eventId: next.id,
			diagnostic: null
		};
	};
	const advanceTo = (targetMs) => {
		if (!Number.isSafeInteger(targetMs) || targetMs < 0 || targetMs > 2147483647) throw new Error(`advanceTo target must be an integer in 0..${MAX_TIME_MS}`);
		if (targetMs < clockMs) throw new Error("advanceTo target is in the past");
		if (invalid) return {
			status: "invalid",
			clockMs,
			processedTotal: processedIds.length,
			eventId: failedEvent?.id ?? null,
			diagnostic
		};
		let lastId = null;
		let lastDiagnostic = null;
		while (!invalid && pending.length > 0 && pending[0].timeMs <= targetMs) {
			const result = stepEvent();
			lastId = result.eventId;
			lastDiagnostic = result.diagnostic;
		}
		if (invalid) return {
			status: "invalid",
			clockMs,
			processedTotal: processedIds.length,
			eventId: lastId,
			diagnostic: lastDiagnostic
		};
		clockMs = targetMs;
		return {
			status: statusOf(),
			clockMs,
			processedTotal: processedIds.length,
			eventId: lastId,
			diagnostic: null
		};
	};
	const snapshotOf = (e) => ({
		id: e.id,
		timeMs: e.timeMs,
		priority: e.priority,
		sequence: e.sequence,
		kind: e.kind,
		data: cloneData(e.data),
		taskId: e.taskId,
		planVersion: e.planVersion
	});
	const snapshot = () => {
		const versions = [...taskPlanVersions.entries()].map(([taskId, version]) => ({
			taskId,
			version
		})).sort((a, b) => a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0);
		return freezeDeep$2({
			engineVersion: OPERATIONS_ENGINE_VERSION,
			clockMs,
			status: statusOf(),
			nextSequence,
			processedTotal: processedIds.length,
			timestampOfCount,
			countAtTimestamp,
			maxProcessedEvents,
			maxEventsPerTimestamp,
			pending: pending.map(snapshotOf),
			processedIds: [...processedIds],
			cancelledIds: [...cancelledIds],
			staleSkippedIds: [...staleSkippedIds],
			taskPlanVersions: versions,
			failedEvent: failedEvent ? snapshotOf(failedEvent) : null,
			diagnostic
		});
	};
	const restore = (value) => {
		if (!isRecord$1(value)) throw new Error("snapshot must be an object");
		const s = value;
		if (s.engineVersion !== "layoutlab.operations-engine/1") throw new Error("snapshot engineVersion mismatch");
		const intIn = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
		if (!intIn(s.clockMs, 0, 2147483647)) throw new Error("snapshot has an invalid clockMs");
		if (s.status !== "ready" && s.status !== "queue-empty" && s.status !== "invalid") throw new Error("snapshot has an invalid status");
		if (!intIn(s.nextSequence, 0, Number.MAX_SAFE_INTEGER)) throw new Error("snapshot has an invalid nextSequence");
		if (!intIn(s.processedTotal, 0, Number.MAX_SAFE_INTEGER)) throw new Error("snapshot has an invalid processedTotal");
		if (!intIn(s.timestampOfCount, 0, 2147483647)) throw new Error("snapshot has an invalid timestampOfCount");
		if (!intIn(s.countAtTimestamp, 0, Number.MAX_SAFE_INTEGER)) throw new Error("snapshot has an invalid countAtTimestamp");
		if (s.maxProcessedEvents !== maxProcessedEvents) throw new Error("snapshot maxProcessedEvents mismatch");
		if (s.maxEventsPerTimestamp !== maxEventsPerTimestamp) throw new Error("snapshot maxEventsPerTimestamp mismatch");
		const readEvent = (v, what) => {
			if (!isRecord$1(v)) throw new Error(`snapshot ${what} must be an object`);
			const e = v;
			if (typeof e.id !== "string" || e.id.length < 1 || e.id.length > 128) throw new Error(`snapshot ${what} has an invalid id`);
			if (!intIn(e.timeMs, 0, 2147483647)) throw new Error(`snapshot ${what} has an invalid timeMs`);
			if (!intIn(e.priority, 0, 1e6)) throw new Error(`snapshot ${what} has an invalid priority`);
			if (!intIn(e.sequence, 0, Number.MAX_SAFE_INTEGER)) throw new Error(`snapshot ${what} has an invalid sequence`);
			if (typeof e.kind !== "string" || e.kind.length < 1 || e.kind.length > 128) throw new Error(`snapshot ${what} has an invalid kind`);
			if (e.taskId !== null && (typeof e.taskId !== "string" || e.taskId.length < 1 || e.taskId.length > 128)) throw new Error(`snapshot ${what} has an invalid taskId`);
			if (e.planVersion !== null && !intIn(e.planVersion, 0, 1e9)) throw new Error(`snapshot ${what} has an invalid planVersion`);
			return {
				id: e.id,
				timeMs: e.timeMs,
				priority: e.priority,
				sequence: e.sequence,
				kind: e.kind,
				data: cloneData(e.data),
				taskId: e.taskId ?? null,
				planVersion: e.planVersion ?? null
			};
		};
		if (!Array.isArray(s.pending)) throw new Error("snapshot pending must be an array");
		const restoredPending = s.pending.map((v, i) => readEvent(v, `pending[${i}]`));
		const readIds = (v, what) => {
			if (!Array.isArray(v)) throw new Error(`snapshot ${what} must be an array`);
			for (const id of v) if (typeof id !== "string" || id.length < 1 || id.length > 128) throw new Error(`snapshot ${what} has an invalid id`);
			return [...v];
		};
		const restoredProcessed = readIds(s.processedIds, "processedIds");
		const restoredCancelled = readIds(s.cancelledIds, "cancelledIds");
		const restoredStale = readIds(s.staleSkippedIds, "staleSkippedIds");
		if (!Array.isArray(s.taskPlanVersions)) throw new Error("snapshot taskPlanVersions must be an array");
		const restoredVersions = /* @__PURE__ */ new Map();
		for (const entry of s.taskPlanVersions) {
			if (!isRecord$1(entry)) throw new Error("snapshot taskPlanVersions entries must be objects");
			const { taskId, version } = entry;
			if (typeof taskId !== "string" || taskId.length < 1 || taskId.length > 128) throw new Error("snapshot has an invalid task plan taskId");
			if (!intIn(version, 0, 1e9)) throw new Error("snapshot has an invalid task plan version");
			if (restoredVersions.has(taskId)) throw new Error(`snapshot duplicates task plan ${taskId}`);
			restoredVersions.set(taskId, version);
		}
		const restoredFailed = s.failedEvent === null ? null : readEvent(s.failedEvent, "failedEvent");
		if (s.diagnostic !== null && (typeof s.diagnostic !== "string" || s.diagnostic.length < 1)) throw new Error("snapshot has an invalid diagnostic");
		const seen = /* @__PURE__ */ new Set();
		const claim = (eventId, what) => {
			if (seen.has(eventId)) throw new Error(`snapshot id ${eventId} appears twice (${what})`);
			seen.add(eventId);
		};
		const pendingSequences = /* @__PURE__ */ new Set();
		for (const e of restoredPending) {
			claim(e.id, "pending");
			if (e.timeMs < s.clockMs) throw new Error(`snapshot pending event ${e.id} is in the past`);
			if (e.sequence >= s.nextSequence) throw new Error(`snapshot pending event ${e.id} has a stale sequence`);
			if (pendingSequences.has(e.sequence)) throw new Error(`snapshot pending events share sequence ${e.sequence}`);
			pendingSequences.add(e.sequence);
		}
		for (const eventId of restoredProcessed) claim(eventId, "processed");
		for (const eventId of restoredCancelled) claim(eventId, "cancelled");
		for (const eventId of restoredStale) claim(eventId, "stale");
		if (restoredProcessed.length !== s.processedTotal) throw new Error("snapshot processedTotal disagrees with processedIds");
		if (seen.size !== s.nextSequence) throw new Error("snapshot nextSequence disagrees with lifetime id count");
		if (s.status === "queue-empty" && restoredPending.length !== 0) throw new Error("queue-empty snapshot must have no pending events");
		if (s.status === "ready" && restoredPending.length === 0) throw new Error("ready snapshot must have pending events");
		const snapClock = s.clockMs;
		const snapProcessedTotal = s.processedTotal;
		const snapTimestampOfCount = s.timestampOfCount;
		const snapCountAtTimestamp = s.countAtTimestamp;
		if (snapTimestampOfCount > snapClock) throw new Error("snapshot timestampOfCount exceeds clockMs");
		if (snapCountAtTimestamp > snapProcessedTotal) throw new Error("snapshot countAtTimestamp exceeds processedTotal");
		if (snapCountAtTimestamp > s.maxEventsPerTimestamp) throw new Error("snapshot countAtTimestamp exceeds maxEventsPerTimestamp");
		if (snapProcessedTotal > s.maxProcessedEvents) throw new Error("snapshot processedTotal exceeds maxProcessedEvents");
		if (snapProcessedTotal === 0) {
			if (snapCountAtTimestamp !== 0 || snapTimestampOfCount !== 0) throw new Error("snapshot counters impossible without processed events");
		} else if (snapCountAtTimestamp === 0) throw new Error("snapshot countAtTimestamp impossible for processed work");
		if (s.status === "invalid") {
			if (!restoredFailed || s.diagnostic === null) throw new Error("invalid snapshot must carry a failed event and diagnostic");
			const failedId = restoredFailed.id;
			const inPending = restoredPending.some((e) => e.id === failedId);
			const inProcessed = restoredProcessed.includes(failedId);
			const isLastProcessed = restoredProcessed[restoredProcessed.length - 1] === failedId;
			const inCancelled = restoredCancelled.includes(failedId);
			const inStale = restoredStale.includes(failedId);
			if (inCancelled || inStale) throw new Error("snapshot failed event must not be a cancelled or stale id");
			if (inPending) {
				if (!snapshotEventsEqual(restoredPending.find((e) => e.id === failedId), restoredFailed)) throw new Error("snapshot failed event disagrees with its pending entry");
			} else if (!isLastProcessed) {
				if (!inProcessed) throw new Error("snapshot failed event id matches no pending or processed entry");
				throw new Error("snapshot failed event must be the last processed id");
			}
			const diagnostic = s.diagnostic;
			if (!diagnostic.includes(failedId)) throw new Error("snapshot diagnostic disagrees with failed event");
			if (diagnostic.startsWith("handler error on ")) {
				if (!isLastProcessed || inPending) throw new Error("snapshot handler failure must be the last processed id");
				if (!diagnostic.startsWith(`handler error on ${failedId}:`)) throw new Error("snapshot diagnostic disagrees with failed event");
			} else if (diagnostic.includes("bound exceeded")) {
				if (!inPending) throw new Error("snapshot bound failure must retain the failed event pending");
				if (!diagnostic.includes(`cannot execute ${failedId}`)) throw new Error("snapshot diagnostic disagrees with failed event");
				const globalTripped = snapProcessedTotal === s.maxProcessedEvents;
				const timestampTripped = snapTimestampOfCount === restoredFailed.timeMs && snapCountAtTimestamp === s.maxEventsPerTimestamp;
				if (diagnostic.startsWith("processed-event bound exceeded")) {
					if (!globalTripped) throw new Error("snapshot global-bound failure disagrees with processedTotal");
				} else if (diagnostic.startsWith("zero-time-work bound exceeded")) {
					if (!timestampTripped) throw new Error("snapshot timestamp-bound failure disagrees with timestamp counters");
				} else if (!globalTripped && !timestampTripped) throw new Error("snapshot bound failure matches no exhausted bound");
			}
		} else if (restoredFailed !== null || s.diagnostic !== null) throw new Error("valid snapshot must not carry failure state");
		restoredPending.sort(compareEvents);
		if (s.status === "invalid" && restoredFailed && s.diagnostic.includes("bound exceeded") && restoredPending.length > 0 && restoredPending[0].id !== restoredFailed.id) throw new Error("snapshot bound failed event must be the next pending event");
		clockMs = s.clockMs;
		nextSequence = s.nextSequence;
		pending = restoredPending;
		idsEver = seen;
		processedIds = restoredProcessed;
		cancelledIds = restoredCancelled;
		staleSkippedIds = restoredStale;
		taskPlanVersions = restoredVersions;
		timestampOfCount = s.timestampOfCount;
		countAtTimestamp = s.countAtTimestamp;
		invalid = s.status === "invalid";
		failedEvent = restoredFailed;
		diagnostic = s.diagnostic ?? null;
	};
	const initialEvents = options.initialEvents ?? [];
	if (!Array.isArray(initialEvents)) throw new Error("initialEvents must be an array");
	for (const event of initialEvents) schedule(event);
	const genesis = snapshot();
	return {
		schedule,
		cancel,
		setTaskPlanVersion,
		stepEvent,
		advanceTo,
		snapshot,
		restore,
		reset: () => restore(structuredClone(genesis)),
		getClockMs: () => clockMs,
		getStatus: statusOf,
		getProcessedTotal: () => processedIds.length,
		getPendingCount: () => pending.length
	};
}
// packages/core/src/version.ts
var CORE_VERSION = "0.1.0";
var SCHEMA_VERSION = "layoutlab.scenario/1";
var REPORT_VERSION = "layoutlab.report/1";
var ROUTE_POLICY_ID = "nearest-neighbor-a-star/1";
// packages/core/src/schema.ts
var MAX_DIM_MM = 1e5;
var MAX_COORD_MM = 1e5;
var MAX_CART_MM = 1e4;
var MAX_MARGIN_MM = 1e4;
var MAX_PASSAGE_MM = 1e4;
var MAX_FREQUENCY = 1e6;
var MAX_QUANTITY = 1e6;
var MAX_REVISION = 1e9;
var MAX_TEXT_LEN = 2e3;
var id = string().min(1).max(128);
var PACKING_ID = "@packing";
var locationId = id.refine((v) => v !== PACKING_ID, { message: "reserved location id" });
var dimMm = number().int().min(1).max(MAX_DIM_MM);
var coordMm = number().int().min(-1e5).max(MAX_COORD_MM);
var pointSchema = strictObject({
	x: coordMm,
	z: coordMm
});
var dimensionsSchema = strictObject({
	width: dimMm,
	depth: dimMm,
	height: dimMm
});
var rackSchema = strictObject({
	id,
	positionMm: pointSchema,
	dimensionsMm: dimensionsSchema,
	yawDeg: union([
		literal(0),
		literal(90),
		literal(180),
		literal(270)
	]),
	assetId: string().min(1).max(128).optional()
});
var locationSchema = strictObject({
	id: locationId,
	rackId: id,
	label: string().min(1).max(MAX_TEXT_LEN),
	usableDimensionsMm: dimensionsSchema,
	storageClass: string().min(1).max(128),
	pickPointMm: pointSchema,
	allowedProductIds: array(id).max(64).optional()
});
var productSchema = strictObject({
	id,
	label: string().min(1).max(MAX_TEXT_LEN),
	storedLoadDimensionsMm: dimensionsSchema,
	requiredStorageClass: string().min(1).max(128),
	allowedLocationIds: array(locationId).max(128).optional(),
	lockedLocationId: locationId.optional()
});
var assignmentSchema = strictObject({
	productId: id,
	locationId
});
var orderLineSchema = strictObject({
	productId: id,
	quantity: number().int().min(1).max(MAX_QUANTITY)
});
var orderSchema = strictObject({
	id,
	frequency: number().int().min(0).max(MAX_FREQUENCY),
	lines: array(orderLineSchema).min(1).max(64)
});
var cartSchema = strictObject({
	widthMm: number().int().min(1).max(MAX_CART_MM),
	lengthMm: number().int().min(1).max(MAX_CART_MM),
	marginMm: number().int().min(0).max(MAX_MARGIN_MM)
});
var provenanceSchema = strictObject({
	category: union([literal("synthetic"), literal("reconstructed")]),
	description: string().min(1).max(MAX_TEXT_LEN),
	sourceUrls: array(string().max(MAX_TEXT_LEN)).max(64),
	assumptions: array(string().max(MAX_TEXT_LEN)).max(256),
	inventedFields: array(string().max(MAX_TEXT_LEN)).max(256)
});
function uniqueIds(items, key, ctx) {
	const seen = /* @__PURE__ */ new Set();
	for (const item of items) {
		const k = key(item);
		if (seen.has(k)) {
			ctx.addIssue({
				code: "custom",
				message: `duplicate id: ${k}`
			});
			return;
		}
		seen.add(k);
	}
}
var scenarioSchema = strictObject({
	schemaVersion: literal(SCHEMA_VERSION),
	id,
	revision: number().int().min(0).max(MAX_REVISION),
	room: strictObject({
		widthMm: dimMm,
		depthMm: dimMm
	}),
	racks: array(rackSchema).max(32),
	locations: array(locationSchema).max(128),
	products: array(productSchema).max(64),
	assignments: array(assignmentSchema).max(128),
	orders: array(orderSchema).max(128),
	packingPointMm: pointSchema,
	cart: cartSchema,
	minimumPassageWidthMm: number().int().min(0).max(MAX_PASSAGE_MM),
	gridSizeMm: literal(100),
	provenance: provenanceSchema
}).superRefine((s, ctx) => {
	uniqueIds(s.racks, (r) => r.id, ctx);
	uniqueIds(s.locations, (l) => l.id, ctx);
	uniqueIds(s.products, (p) => p.id, ctx);
	uniqueIds(s.orders, (o) => o.id, ctx);
	const totalLines = s.orders.reduce((n, o) => n + o.lines.length, 0);
	if (totalLines > 4096) ctx.addIssue({
		code: "custom",
		message: `too many order lines: ${totalLines}`
	});
});
var requirementsSchema = strictObject({
	objective: literal("minimize_weighted_picking_travel"),
	maxRelocatedProducts: number().int().min(0).max(64),
	lockedProductIds: array(id).max(64),
	assumptions: array(string().max(MAX_TEXT_LEN)).max(256),
	unresolvedQuestions: array(string().max(MAX_TEXT_LEN)).max(256)
}).superRefine((r, ctx) => {
	uniqueIds(r.lockedProductIds, (v) => v, ctx);
});
var changeSchema = strictObject({
	productId: id,
	locationId
});
strictObject({
	scenarioRevision: number().int().min(0).max(MAX_REVISION),
	changes: array(changeSchema).max(64),
	rationale: string().max(MAX_TEXT_LEN)
});
// packages/core/src/geometry.ts
function inflateRect(rect, radiusMm) {
	return {
		minX: rect.minX - radiusMm,
		maxX: rect.maxX + radiusMm,
		minZ: rect.minZ - radiusMm,
		maxZ: rect.maxZ + radiusMm
	};
}
function pointInRect(p, rect) {
	return p.x >= rect.minX && p.x <= rect.maxX && p.z >= rect.minZ && p.z <= rect.maxZ;
}
function rectsOverlapInterior(a, b) {
	return Math.max(a.minX, b.minX) < Math.min(a.maxX, b.maxX) && Math.max(a.minZ, b.minZ) < Math.min(a.maxZ, b.maxZ);
}
function orientation(ax, az, bx, bz, cx, cz) {
	const v = (bz - az) * (cx - bx) - (bx - ax) * (cz - bz);
	if (v > 0) return 1;
	if (v < 0) return -1;
	return 0;
}
function onSegment(ax, az, bx, bz, cx, cz) {
	return bx >= Math.min(ax, cx) && bx <= Math.max(ax, cx) && bz >= Math.min(az, cz) && bz <= Math.max(az, cz);
}
function segmentsIntersect(p1, p2, p3, p4) {
	const d1 = orientation(p3.x, p3.z, p4.x, p4.z, p1.x, p1.z);
	const d2 = orientation(p3.x, p3.z, p4.x, p4.z, p2.x, p2.z);
	const d3 = orientation(p1.x, p1.z, p2.x, p2.z, p3.x, p3.z);
	const d4 = orientation(p1.x, p1.z, p2.x, p2.z, p4.x, p4.z);
	if (d1 !== d2 && d3 !== d4) return true;
	if (d1 === 0 && onSegment(p3.x, p3.z, p1.x, p1.z, p4.x, p4.z)) return true;
	if (d2 === 0 && onSegment(p3.x, p3.z, p2.x, p2.z, p4.x, p4.z)) return true;
	if (d3 === 0 && onSegment(p1.x, p1.z, p3.x, p3.z, p2.x, p2.z)) return true;
	if (d4 === 0 && onSegment(p1.x, p1.z, p4.x, p4.z, p2.x, p2.z)) return true;
	return false;
}
function segmentHitsRect(a, b, rect) {
	if (pointInRect(a, rect) || pointInRect(b, rect)) return true;
	const corners = [
		{
			x: rect.minX,
			z: rect.minZ
		},
		{
			x: rect.maxX,
			z: rect.minZ
		},
		{
			x: rect.maxX,
			z: rect.maxZ
		},
		{
			x: rect.minX,
			z: rect.maxZ
		}
	];
	for (let i = 0; i < 4; i++) {
		const c1 = corners[i];
		const c2 = corners[(i + 1) % 4];
		if (segmentsIntersect(a, b, c1, c2)) return true;
	}
	return false;
}
function segmentBlocked(a, b, obstacles) {
	return obstacles.some((o) => segmentHitsRect(a, b, o));
}
// packages/core/src/scene.ts
function pointNavigable(p, scenario, nav) {
	const r = nav.navigationRadiusMm;
	if (p.x <= r || p.z <= r) return false;
	if (p.x >= scenario.room.widthMm - r || p.z >= scenario.room.depthMm - r) return false;
	return !nav.inflatedObstacles.some((o) => pointInRect(p, o));
}
// packages/core/src/nav.ts
var CONNECTION_RADIUS_MM = 2e3;
var MAX_GRID_NODES = 25e4;
var MAX_WORKLOAD_EXPANSIONS = 2e5;
var BudgetExhausted = class extends Error {
	constructor(message) {
		super(message);
		this.name = "BudgetExhausted";
	}
};
function createNavBudget(maxExpansions = MAX_WORKLOAD_EXPANSIONS) {
	return { remainingExpansions: maxExpansions };
}
function gridNodeCount(nav) {
	return (nav.cols + 1) * (nav.rows + 1);
}
function nodePoint(node) {
	return {
		x: node.i * 100,
		z: node.j * 100
	};
}
function nodeFree(node, scenario, nav) {
	if (node.i < 0 || node.j < 0 || node.i > nav.cols || node.j > nav.rows) return false;
	return pointNavigable(nodePoint(node), scenario, nav);
}
function connectEndpoint(p, scenario, nav) {
	if (!pointNavigable(p, scenario, nav)) return null;
	const r = CONNECTION_RADIUS_MM;
	const iMin = Math.max(0, Math.ceil((p.x - r) / 100));
	const iMax = Math.min(nav.cols, Math.floor((p.x + r) / 100));
	const jMin = Math.max(0, Math.ceil((p.z - r) / 100));
	const jMax = Math.min(nav.rows, Math.floor((p.z + r) / 100));
	const candidates = [];
	for (let j = jMin; j <= jMax; j++) for (let i = iMin; i <= iMax; i++) {
		const n = nodePoint({
			i,
			j
		});
		const d2 = (n.x - p.x) ** 2 + (n.z - p.z) ** 2;
		if (d2 <= r * r) candidates.push({
			node: {
				i,
				j
			},
			d2
		});
	}
	candidates.sort((a, b) => a.d2 - b.d2 || a.node.j - b.node.j || a.node.i - b.node.i);
	for (const { node, d2 } of candidates) {
		if (!nodeFree(node, scenario, nav)) continue;
		if (segmentBlocked(p, nodePoint(node), nav.inflatedObstacles)) continue;
		return {
			node,
			connectorMm: Math.ceil(Math.sqrt(d2))
		};
	}
	return null;
}
function lessNode(a, b) {
	if (a.f !== b.f) return a.f < b.f;
	if (a.h !== b.h) return a.h < b.h;
	if (a.j !== b.j) return a.j < b.j;
	return a.i < b.i;
}
function heapPush(heap, node) {
	heap.push(node);
	let k = heap.length - 1;
	while (k > 0) {
		const parent = k - 1 >> 1;
		if (lessNode(heap[k], heap[parent])) {
			[heap[k], heap[parent]] = [heap[parent], heap[k]];
			k = parent;
		} else break;
	}
}
function heapPop(heap) {
	const top = heap[0];
	const last = heap.pop();
	if (heap.length > 0 && last !== void 0) {
		heap[0] = last;
		let k = 0;
		for (;;) {
			const left = 2 * k + 1;
			const right = 2 * k + 2;
			let smallest = k;
			if (left < heap.length && lessNode(heap[left], heap[smallest])) smallest = left;
			if (right < heap.length && lessNode(heap[right], heap[smallest])) smallest = right;
			if (smallest === k) break;
			[heap[k], heap[smallest]] = [heap[smallest], heap[k]];
			k = smallest;
		}
	}
	return top;
}
function astarSearch(start, goal, scenario, nav, budget) {
	if (start.i === goal.i && start.j === goal.j) return [{
		i: start.i,
		j: start.j
	}];
	const count = gridNodeCount(nav);
	if (count > 25e4) throw new BudgetExhausted(`grid has ${count} nodes, cap is ${MAX_GRID_NODES}`);
	const stride = nav.cols + 1;
	const key = (i, j) => j * stride + i;
	const gScore = new Array(count).fill(Infinity);
	const closed = new Array(count).fill(false);
	const parent = new Array(count).fill(-1);
	gScore[key(start.i, start.j)] = 0;
	const h0 = Math.abs(goal.i - start.i) + Math.abs(goal.j - start.j);
	const heap = [{
		i: start.i,
		j: start.j,
		f: h0,
		h: h0,
		g: 0
	}];
	const dirs = [
		[1, 0],
		[-1, 0],
		[0, 1],
		[0, -1]
	];
	while (heap.length > 0) {
		if (budget.remainingExpansions <= 0) throw new BudgetExhausted("workload A* expansion budget exhausted");
		budget.remainingExpansions -= 1;
		const current = heapPop(heap);
		const ck = key(current.i, current.j);
		if (closed[ck]) continue;
		closed[ck] = true;
		if (current.i === goal.i && current.j === goal.j) {
			const path = [];
			let k = ck;
			while (k !== -1) {
				path.push({
					i: k % stride,
					j: Math.floor(k / stride)
				});
				k = parent[k];
			}
			path.reverse();
			return path;
		}
		for (const [di, dj] of dirs) {
			const ni = current.i + di;
			const nj = current.j + dj;
			if (ni < 0 || nj < 0 || ni > nav.cols || nj > nav.rows) continue;
			const nk = key(ni, nj);
			if (closed[nk]) continue;
			const center = nodePoint({
				i: ni,
				j: nj
			});
			if (!pointNavigable(center, scenario, nav)) continue;
			if (segmentBlocked(nodePoint(current), center, nav.inflatedObstacles)) continue;
			const g = current.g + 1;
			if (g < gScore[nk]) {
				gScore[nk] = g;
				parent[nk] = ck;
				const h = Math.abs(goal.i - ni) + Math.abs(goal.j - nj);
				heapPush(heap, {
					i: ni,
					j: nj,
					f: g + h,
					h,
					g
				});
			}
		}
	}
	return null;
}
function astarNodePath(start, goal, scenario, nav, budget) {
	const path = astarSearch(start, goal, scenario, nav, budget);
	return path === null ? null : path.map((n) => ({
		i: n.i,
		j: n.j
	}));
}
function shortestPathPointsMm(a, b, scenario, nav, budget = createNavBudget()) {
	if (a.x === b.x && a.z === b.z) return pointNavigable(a, scenario, nav) ? [{
		x: a.x,
		z: a.z
	}] : null;
	const ca = connectEndpoint(a, scenario, nav);
	const cb = connectEndpoint(b, scenario, nav);
	if (ca === null || cb === null) return null;
	const nodes = astarNodePath(ca.node, cb.node, scenario, nav, budget);
	if (nodes === null) return null;
	const points = [{
		x: a.x,
		z: a.z
	}];
	for (const n of nodes) {
		const p = nodePoint(n);
		const last = points[points.length - 1];
		if (p.x !== last.x || p.z !== last.z) points.push(p);
	}
	const last = points[points.length - 1];
	if (b.x !== last.x || b.z !== last.z) points.push({
		x: b.x,
		z: b.z
	});
	return points;
}
// packages/core/src/failure.ts
var M5_FAILURE_VERSION = "layoutlab.m5failure/1";
var MAX_RUN_PROPOSALS = 3;
var MAX_RUN_REQUESTS = 4;
var MAX_RUN_TIMEOUT_MS = 12e4;
var usageSchema = strictObject({
	promptTokens: number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
	completionTokens: number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
	totalTokens: number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable()
});
var diagnosticsSchema = strictObject({
	responseId: string().max(128).nullable(),
	finishReason: string().max(128).nullable(),
	errorCode: string().max(128).nullable()
});
strictObject({
	envelopeVersion: literal(M5_FAILURE_VERSION),
	runId: string().min(1).max(128),
	exportedAt: string().datetime({ offset: true }),
	apiVersion: string().min(1).max(128),
	coreVersion: string().min(1).max(128),
	routePolicy: string().min(1).max(128),
	provider: literal("meta"),
	providerKind: _enum(["meta", "fixture"]),
	realMetaRequests: number().int().min(0).max(MAX_RUN_REQUESTS),
	modelId: string().min(1).max(128),
	promptVersion: string().min(1).max(128),
	generationSettings: strictObject({
		reasoningEffort: string().min(1).max(64),
		maxCompletionTokens: number().int().min(1).max(2e3)
	}),
	state: _enum([
		"FAILED",
		"CANCELLED",
		"TIMED_OUT"
	]),
	phase: string().min(1).max(64),
	outcome: _null(),
	reportAvailable: literal(false),
	measurement: _null(),
	evaluationBoundary: string().min(1).max(MAX_TEXT_LEN),
	modelRequestsUsed: number().int().min(0).max(MAX_RUN_REQUESTS),
	proposalsUsed: literal(0),
	budgets: strictObject({
		maxProposals: number().int().min(0).max(MAX_RUN_PROPOSALS),
		maxRequests: number().int().min(0).max(MAX_RUN_REQUESTS),
		timeoutMs: number().int().min(1).max(MAX_RUN_TIMEOUT_MS)
	}),
	usageTotals: usageSchema.nullable(),
	usageIncomplete: boolean(),
	scenario: scenarioSchema,
	requestText: string().min(1).max(MAX_TEXT_LEN),
	requirements: requirementsSchema.nullable(),
	requirementsDraft: requirementsSchema.nullable(),
	interpretedUnresolved: array(string().max(MAX_TEXT_LEN)).max(256),
	interpretError: string().max(MAX_TEXT_LEN).nullable(),
	interpretDiagnostics: diagnosticsSchema.nullable(),
	attempts: array(never()).max(0),
	lastError: string().max(MAX_TEXT_LEN).nullable(),
	limitations: array(string().max(MAX_TEXT_LEN)).min(1).max(64)
}).refine((e) => e.modelRequestsUsed <= e.budgets.maxRequests, { message: "used requests exceed budget" }).refine((e) => e.realMetaRequests <= e.modelRequestsUsed, { message: "real requests exceed used requests" }).refine((e) => e.providerKind !== "fixture" || e.realMetaRequests === 0, { message: "fixture audits must report realMetaRequests 0" }).refine((e) => e.providerKind !== "meta" || e.realMetaRequests === e.modelRequestsUsed, { message: "meta audits must account every request as a real Meta request" });
// packages/core/src/report.ts
var legClaimSchema = object({
	fromId: string().min(1).max(128),
	toId: string().min(1).max(128),
	distanceMm: number().int().min(0).nullable()
});
var workloadClaimSchema = object({
	orders: array(object({
		orderId: string().min(1).max(128),
		frequency: number().int().min(0),
		distinctProductIds: array(string().min(1).max(128)).max(64),
		units: number().int().min(0),
		visitSequence: array(string().min(1).max(128)).max(64),
		legs: array(legClaimSchema).max(65),
		distanceMm: number().int().min(0).nullable(),
		reachable: boolean(),
		reason: string().max(MAX_TEXT_LEN).nullable()
	})).max(128),
	reachableOrders: number().int().min(0),
	totalFrequency: number().int().min(0).nullable(),
	weightedTravelMm: number().int().min(0).nullable(),
	meanOrderDistanceMm: number().min(0).nullable(),
	totalUnits: number().int().min(0).nullable(),
	arithmeticOverflow: boolean(),
	budgetExhausted: boolean()
});
var candidateClaimSchema = object({
	name: string().min(1).max(128),
	assignment: array(assignmentSchema).max(128),
	valid: boolean(),
	weightedTravelMm: number().int().min(0).nullable(),
	relocationCount: number().int().min(0).max(128),
	workload: workloadClaimSchema.nullable()
});
object({
	reportVersion: literal(REPORT_VERSION),
	coreVersion: literal(CORE_VERSION),
	routePolicy: literal(ROUTE_POLICY_ID),
	scenario: scenarioSchema,
	requirements: requirementsSchema,
	baseline: candidateClaimSchema,
	candidates: array(candidateClaimSchema).max(64),
	bestName: string().min(1).max(128).nullable(),
	improvementPercents: record(string(), number().nullable()).refine((r) => Object.keys(r).length <= 65, { message: "too many improvement entries" }),
	outcome: _enum([
		"IMPROVED_VALID_ASSIGNMENT",
		"VALID_ASSIGNMENT_FOUND",
		"NO_IMPROVEMENT_FOUND",
		"SEARCH_EXHAUSTED",
		"INPUT_INVALID"
	])
});
// packages/simulation/src/traffic.ts
var TRAFFIC_CONTACT_EPS_MM = 1e-6;
function discsConflict(centerDistMm, radiusAmm, radiusBmm) {
	return centerDistMm <= radiusAmm + radiusBmm + TRAFFIC_CONTACT_EPS_MM;
}
function stationaryVsStationaryConflict(posA, radiusAmm, posB, radiusBmm) {
	return discsConflict(Math.hypot(posA.x - posB.x, posA.z - posB.z), radiusAmm, radiusBmm);
}
function poseOnSegment(seg, tMs) {
	if (tMs <= seg.startMs || seg.endMs <= seg.startMs) return {
		x: seg.fromX,
		z: seg.fromZ
	};
	if (tMs >= seg.endMs) return {
		x: seg.toX,
		z: seg.toZ
	};
	const f = (tMs - seg.startMs) / (seg.endMs - seg.startMs);
	return {
		x: seg.fromX + (seg.toX - seg.fromX) * f,
		z: seg.fromZ + (seg.toZ - seg.fromZ) * f
	};
}
function velocityOf(seg) {
	const dt = seg.endMs - seg.startMs;
	if (dt <= 0) return {
		x: 0,
		z: 0
	};
	return {
		x: (seg.toX - seg.fromX) / dt,
		z: (seg.toZ - seg.fromZ) / dt
	};
}
function posAt(seg, v, tMs) {
	const dt = tMs - seg.startMs;
	return {
		x: seg.fromX + v.x * dt,
		z: seg.fromZ + v.z * dt
	};
}
function minLinearDist(r0, v, lenMs) {
	const vv = v.x * v.x + v.z * v.z;
	if (!(vv > 0) || lenMs <= 0) return Math.hypot(r0.x, r0.z);
	const tc = -(r0.x * v.x + r0.z * v.z) / vv;
	const c = tc < 0 ? 0 : tc > lenMs ? lenMs : tc;
	return Math.hypot(r0.x + v.x * c, r0.z + v.z * c);
}
function minSeparationMovingMoving(a, b) {
	const t0 = Math.max(a.startMs, b.startMs);
	const t1 = Math.min(a.endMs, b.endMs);
	if (t0 > t1) return Infinity;
	const va = velocityOf(a);
	const vb = velocityOf(b);
	const pa0 = posAt(a, va, t0);
	const pb0 = posAt(b, vb, t0);
	return minLinearDist({
		x: pa0.x - pb0.x,
		z: pa0.z - pb0.z
	}, {
		x: va.x - vb.x,
		z: va.z - vb.z
	}, t1 - t0);
}
function minSeparationMovingStationary(seg, stat) {
	return minSeparationMovingStationaryInWindow(seg, stat, seg.startMs, seg.endMs);
}
function minSeparationMovingStationaryInWindow(seg, stat, winStartMs, winEndMs) {
	const t0 = Math.max(seg.startMs, winStartMs);
	const t1 = Math.min(seg.endMs, winEndMs);
	if (t0 > t1) return Infinity;
	const v = velocityOf(seg);
	const p0 = posAt(seg, v, t0);
	return minLinearDist({
		x: p0.x - stat.x,
		z: p0.z - stat.z
	}, v, t1 - t0);
}
function trajectoriesConflict(a, b) {
	const required = a.radiusMm + b.radiusMm + TRAFFIC_CONTACT_EPS_MM;
	for (let i = 0; i < a.segments.length; i += 1) for (let j = 0; j < b.segments.length; j += 1) {
		const d = minSeparationMovingMoving(a.segments[i], b.segments[j]);
		if (d === Infinity) continue;
		if (d <= required) return {
			conflict: true,
			detail: {
				kind: "moving-moving",
				minDistMm: d,
				requiredMm: a.radiusMm + b.radiusMm,
				segA: i,
				segB: j
			}
		};
	}
	return {
		conflict: false,
		detail: null
	};
}
function trajectoryVsStationaryConflict(traj, stat, statRadiusMm) {
	const required = traj.radiusMm + statRadiusMm + TRAFFIC_CONTACT_EPS_MM;
	for (let i = 0; i < traj.segments.length; i += 1) {
		const d = minSeparationMovingStationary(traj.segments[i], stat);
		if (d <= required) return {
			conflict: true,
			detail: {
				kind: "moving-stationary",
				minDistMm: d,
				requiredMm: traj.radiusMm + statRadiusMm,
				segA: i
			}
		};
	}
	return {
		conflict: false,
		detail: null
	};
}
function trajectoryVsStationaryInWindowConflict(traj, stat, statRadiusMm, winStartMs, winEndMs) {
	const required = traj.radiusMm + statRadiusMm + TRAFFIC_CONTACT_EPS_MM;
	for (let i = 0; i < traj.segments.length; i += 1) {
		const d = minSeparationMovingStationaryInWindow(traj.segments[i], stat, winStartMs, winEndMs);
		if (d === Infinity) continue;
		if (d <= required) return {
			conflict: true,
			detail: {
				kind: "moving-stationary",
				minDistMm: d,
				requiredMm: traj.radiusMm + statRadiusMm,
				segA: i
			}
		};
	}
	return {
		conflict: false,
		detail: null
	};
}
function zoneHoldsOverlap(startAMs, endAMs, startBMs, endBMs) {
	return Math.max(startAMs, startBMs) < Math.min(endAMs, endBMs);
}
function pathRequiresZone(points, radiusMm, zone) {
	if (points.length === 0) return false;
	const inflated = inflateRect(zone, radiusMm);
	if (points.length === 1) {
		const p = points[0];
		return p.x >= inflated.minX && p.x <= inflated.maxX && p.z >= inflated.minZ && p.z <= inflated.maxZ;
	}
	for (let i = 0; i + 1 < points.length; i += 1) {
		const a = points[i];
		const b = points[i + 1];
		if (segmentHitsRect(a, b, inflated)) return true;
	}
	return false;
}
// packages/simulation/src/navigation.ts
function footprintRadiusMm(footprint) {
	return Math.ceil(Math.hypot(footprint.width, footprint.length) / 2) + footprint.margin;
}
function footprintRect(center, footprint) {
	return {
		minX: center.x - footprint.width / 2,
		maxX: center.x + footprint.width / 2,
		minZ: center.z - footprint.length / 2,
		maxZ: center.z + footprint.length / 2
	};
}
function occupancyRectFor(moverRadiusMm, otherPose, otherRadiusMm) {
	const half = otherRadiusMm + moverRadiusMm + TRAFFIC_CONTACT_EPS_MM;
	return {
		minX: otherPose.x - half,
		maxX: otherPose.x + half,
		minZ: otherPose.z - half,
		maxZ: otherPose.z + half
	};
}
function ceilDist(a, b) {
	return Math.ceil(Math.hypot(a.x - b.x, a.z - b.z));
}
function isSafeIntPair(p) {
	if (typeof p !== "object" || p === null) return false;
	const { x, z } = p;
	return Number.isSafeInteger(x) && Number.isSafeInteger(z);
}
function createTransportNav(scenario) {
	const roomMm = {
		widthMm: scenario.geometry.room.widthMm,
		depthMm: scenario.geometry.room.depthMm
	};
	const rackRects = scenario.geometry.racks.map((r) => ({
		minX: r.positionMm.x - r.dimensionsMm.width / 2,
		maxX: r.positionMm.x + r.dimensionsMm.width / 2,
		minZ: r.positionMm.z - r.dimensionsMm.depth / 2,
		maxZ: r.positionMm.z + r.dimensionsMm.depth / 2
	}));
	const obstacleRects = scenario.geometry.obstacles.map((o) => ({
		minX: o.minXMm,
		maxX: o.maxXMm,
		minZ: o.minZMm,
		maxZ: o.maxZMm
	}));
	const profiles = /* @__PURE__ */ new Map();
	for (const u of scenario.mobileUnits) profiles.set(u.id, {
		unitId: u.id,
		footprintMm: { ...u.footprintMm },
		speedMmPerSecond: u.speedMmPerSecond,
		parkingSlotMm: {
			x: u.parkingSlotMm.x,
			z: u.parkingSlotMm.z
		},
		radiusMm: footprintRadiusMm(u.footprintMm)
	});
	const coreScenario = { room: roomMm };
	const cols = Math.floor(roomMm.widthMm / 100);
	const rows = Math.floor(roomMm.depthMm / 100);
	const radiusForUnit = (unitId) => {
		const p = profiles.get(unitId);
		if (!p) throw new Error(`unknown mobile unit: ${unitId}`);
		return p.radiusMm;
	};
	const rectForUnitAt = (unitId, pos) => {
		const p = profiles.get(unitId);
		if (!p) throw new Error(`unknown mobile unit: ${unitId}`);
		return footprintRect(pos, p.footprintMm);
	};
	const buildNav = (forUnitId, otherPoses) => {
		const self = profiles.get(forUnitId);
		if (!self) throw new Error(`unknown mobile unit: ${forUnitId}`);
		const r = self.radiusMm;
		const cartR = Math.ceil(Math.hypot(self.footprintMm.width, self.footprintMm.length) / 2);
		const inflated = [...rackRects.map((rc) => inflateRect(rc, r)), ...obstacleRects.map((oc) => inflateRect(oc, r))];
		if (otherPoses) for (const [otherId, pose] of otherPoses) {
			if (otherId === forUnitId) continue;
			const other = profiles.get(otherId);
			if (!other) continue;
			inflated.push(occupancyRectFor(r, pose, other.radiusMm));
		}
		return {
			cartRadiusMm: cartR,
			navigationRadiusMm: r,
			inflatedObstacles: inflated,
			cols,
			rows
		};
	};
	const isStaticNavigable = (point, forUnitId) => {
		if (!isSafeIntPair(point)) return false;
		return pointNavigable(point, coreScenario, buildNav(forUnitId, null));
	};
	const isNavigable = (point, forUnitId, otherPoses) => {
		if (!isSafeIntPair(point)) return false;
		return pointNavigable(point, coreScenario, buildNav(forUnitId, otherPoses));
	};
	const rectOverlapsActual = (rect) => [...rackRects, ...obstacleRects].some((o) => Math.max(rect.minX, o.minX) < Math.min(rect.maxX, o.maxX) && Math.max(rect.minZ, o.minZ) < Math.min(rect.maxZ, o.maxZ));
	const rectInRoom = (rect) => rect.minX >= 0 && rect.minZ >= 0 && rect.maxX <= roomMm.widthMm && rect.maxZ <= roomMm.depthMm;
	const occupiersContaining = (point, forUnitId, otherPoses) => {
		const self = profiles.get(forUnitId);
		const out = [];
		for (const [otherId, pose] of otherPoses) {
			if (otherId === forUnitId) continue;
			const other = profiles.get(otherId);
			if (!other) continue;
			if (pointInRect(point, occupancyRectFor(self.radiusMm, pose, other.radiusMm))) out.push(otherId);
		}
		out.sort();
		return out;
	};
	const blockingCandidatesOnCorridor = (points, forUnitId, otherPoses) => {
		const self = profiles.get(forUnitId);
		if (!self) throw new Error(`unknown mobile unit: ${forUnitId}`);
		const out = [];
		for (const [otherId, pose] of otherPoses) {
			if (otherId === forUnitId) continue;
			const other = profiles.get(otherId);
			if (!other) continue;
			const inflated = occupancyRectFor(self.radiusMm, pose, other.radiusMm);
			let touches = false;
			if (points.length <= 1) touches = points.length === 1 && pointInRect(points[0], inflated);
			else for (let i = 0; i + 1 < points.length; i += 1) if (segmentHitsRect(points[i], points[i + 1], inflated)) {
				touches = true;
				break;
			}
			if (touches) out.push(otherId);
		}
		out.sort();
		return out;
	};
	const routeFromContext = (from, to, nav) => {
		let pts;
		try {
			pts = shortestPathPointsMm(from, to, coreScenario, nav, createNavBudget());
		} catch (err) {
			return {
				status: "rejected",
				reason: "NO_PATH",
				message: `no path: ${err instanceof Error ? err.message : String(err)}`
			};
		}
		if (pts === null) return {
			status: "rejected",
			reason: "NO_PATH",
			message: "no path"
		};
		for (let i = 0; i + 1 < pts.length; i += 1) {
			const a = pts[i];
			const b = pts[i + 1];
			if (segmentBlocked(a, b, nav.inflatedObstacles)) return {
				status: "rejected",
				reason: "NO_PATH",
				message: "route segment violates inflated obstacles"
			};
		}
		const points = pts.map((p) => ({
			x: p.x,
			z: p.z
		}));
		const distancesMm = [];
		for (let i = 0; i + 1 < points.length; i += 1) distancesMm.push(ceilDist(points[i], points[i + 1]));
		return {
			status: "ok",
			points,
			distancesMm,
			totalDistanceMm: distancesMm.reduce((n, d) => n + d, 0)
		};
	};
	const classifyEndpoints = (from, to, forUnitId, otherPoses) => {
		if (!profiles.has(forUnitId)) return {
			status: "rejected",
			reason: "UNKNOWN_UNIT",
			message: `unknown mobile unit: ${forUnitId}`
		};
		if (!isSafeIntPair(from) || !isSafeIntPair(to)) return {
			status: "rejected",
			reason: "INVALID_COORDINATES",
			message: "route endpoints must be safe-integer XZ mm"
		};
		const toRect = footprintRect(to, profiles.get(forUnitId).footprintMm);
		if (!rectInRoom(toRect)) return {
			status: "rejected",
			reason: "ROOM_EXCEEDED",
			message: `destination (${to.x},${to.z}) footprint leaves the room`
		};
		if (rectOverlapsActual(toRect)) return {
			status: "rejected",
			reason: "OBSTACLE_OVERLAP",
			message: `destination (${to.x},${to.z}) footprint overlaps a rack/obstacle`
		};
		const nav = buildNav(forUnitId, otherPoses);
		if (!pointNavigable(from, coreScenario, nav)) {
			let fromBlocker;
			let fromCandidates;
			if (otherPoses) {
				const staticNav = buildNav(forUnitId, null);
				if (pointNavigable(from, coreScenario, staticNav)) {
					const witnesses = occupiersContaining(from, forUnitId, otherPoses);
					if (witnesses.length === 1) fromBlocker = witnesses[0];
					else fromCandidates = witnesses;
				}
			}
			return {
				status: "rejected",
				reason: "FROM_UNNAVIGABLE",
				message: `start (${from.x},${from.z}) violates clearance`,
				...fromBlocker !== void 0 ? { blockerUnitId: fromBlocker } : {},
				...fromCandidates !== void 0 ? { candidateUnitIds: fromCandidates } : {}
			};
		}
		if (!pointNavigable(to, coreScenario, nav)) {
			if (otherPoses) {
				const staticNav = buildNav(forUnitId, null);
				if (pointNavigable(to, coreScenario, staticNav)) {
					const witnesses = occupiersContaining(to, forUnitId, otherPoses);
					if (witnesses.length === 1) return {
						status: "rejected",
						reason: "OCCUPIED_GOAL",
						message: `destination (${to.x},${to.z}) blocked by unit occupancy`,
						blockerUnitId: witnesses[0]
					};
					return {
						status: "rejected",
						reason: "OCCUPIED_GOAL",
						message: `destination (${to.x},${to.z}) blocked by ambiguous unit occupancy (${witnesses.length} candidates)`,
						candidateUnitIds: witnesses
					};
				}
			}
			return {
				status: "rejected",
				reason: "TO_UNNAVIGABLE",
				message: `destination (${to.x},${to.z}) violates clearance`
			};
		}
		return null;
	};
	const findRoute = (from, to, forUnitId, otherPoses) => {
		const early = classifyEndpoints(from, to, forUnitId, otherPoses);
		if (early) return early;
		return routeFromContext(from, to, buildNav(forUnitId, otherPoses));
	};
	const findStaticRoute = (from, to, forUnitId) => {
		const early = classifyEndpoints(from, to, forUnitId, null);
		if (early) {
			if (early.reason === "OCCUPIED_GOAL") return {
				...early,
				reason: "TO_UNNAVIGABLE"
			};
			return early;
		}
		return routeFromContext(from, to, buildNav(forUnitId, null));
	};
	return {
		roomMm,
		rackRects: [...rackRects],
		obstacleRects: [...obstacleRects],
		unitProfiles: profiles,
		radiusForUnit,
		rectForUnitAt,
		isStaticNavigable,
		isNavigable,
		findRoute,
		findStaticRoute,
		blockingCandidatesOnCorridor
	};
}
// packages/simulation/src/resources.ts
function assertId(value, what) {
	if (typeof value !== "string" || value.length < 1 || value.length > 128) throw new Error(`${what} must be a 1..128 character string`);
	return value;
}
function assertTimeMs(value, what) {
	if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) throw new Error(`${what} must be a safe integer in 0..${MAX_TIME_MS}`);
	return value;
}
function freezeDeep$1(value) {
	if (Array.isArray(value)) {
		for (const item of value) freezeDeep$1(item);
		return Object.freeze(value);
	}
	if (typeof value === "object" && value !== null) {
		for (const key of Object.keys(value)) freezeDeep$1(value[key]);
		return Object.freeze(value);
	}
	return value;
}
function createServiceStation(resource) {
	const cfg = operationsResourceSchema.parse(resource);
	const resourceId = cfg.id;
	const serviceCapacity = cfg.serviceCapacity;
	const serviceDurationMs = cfg.serviceDurationMs;
	const positionIds = cfg.servicePositions.map((s) => s.id);
	const queueIds = cfg.queueSlots.map((s) => s.id);
	if (serviceCapacity > positionIds.length) throw new Error(`resource ${resourceId} serviceCapacity ${serviceCapacity} exceeds ${positionIds.length} service positions; reconcile configured positions with capacity before live admission`);
	const slotIds = [...cfg.servicePositions, ...cfg.queueSlots].map((s) => s.id);
	if (new Set(slotIds).size !== slotIds.length) throw new Error(`resource ${resourceId} reuses a slot id`);
	const slotCoords = [...cfg.servicePositions, ...cfg.queueSlots].map((s) => `${s.x},${s.z}`);
	if (new Set(slotCoords).size !== slotCoords.length) throw new Error(`resource ${resourceId} stacks slots at one coordinate`);
	const jobs = /* @__PURE__ */ new Map();
	const positionReleasedAt = /* @__PURE__ */ new Map();
	const occupiedPositions = () => {
		const used = /* @__PURE__ */ new Set();
		for (const job of jobs.values()) if ((job.state === "in-service" || job.state === "output-held") && job.positionId) used.add(job.positionId);
		return used;
	};
	const occupiedQueueSlots = () => {
		const used = /* @__PURE__ */ new Set();
		for (const job of jobs.values()) if (job.state === "queued" && job.queueSlotId) used.add(job.queueSlotId);
		return used;
	};
	const queuedByFifo = () => [...jobs.values()].filter((j) => j.state === "queued").sort((a, b) => a.enqueueTimeMs - b.enqueueTimeMs || (a.jobId < b.jobId ? -1 : 1));
	const firstFree = (ids, used) => {
		for (const id of ids) if (!used.has(id)) return id;
		return null;
	};
	return {
		enqueue: (cmd) => {
			const jobId = assertId(cmd.jobId, "jobId");
			const enqueueTimeMs = assertTimeMs(cmd.enqueueTimeMs, "enqueueTimeMs");
			if (jobs.has(jobId)) throw new Error(`duplicate job id: ${jobId}`);
			const queued = queuedByFifo();
			const slot = firstFree(queueIds, occupiedQueueSlots());
			if (slot === null) {
				if (queueIds.length === 0 && queued.length === 0) {
					if ([...jobs.values()].filter((j) => j.state === "in-service" || j.state === "output-held").length < serviceCapacity) {
						jobs.set(jobId, {
							jobId,
							state: "queued",
							enqueueTimeMs,
							queueSlotId: null,
							positionId: null,
							startTimeMs: null,
							finishTimeMs: null
						});
						return {
							status: "queued",
							jobId,
							queueSlotId: null
						};
					}
				}
				return {
					status: "waiting-outside",
					jobId,
					reason: {
						code: "QUEUE_FULL",
						queueSlots: queueIds.length,
						queued: queued.length
					}
				};
			}
			jobs.set(jobId, {
				jobId,
				state: "queued",
				enqueueTimeMs,
				queueSlotId: slot,
				positionId: null,
				startTimeMs: null,
				finishTimeMs: null
			});
			return {
				status: "queued",
				jobId,
				queueSlotId: slot
			};
		},
		tryStart: (cmd) => {
			const jobId = assertId(cmd.jobId, "jobId");
			const timeMs = assertTimeMs(cmd.timeMs, "timeMs");
			if (typeof cmd.inputReady !== "boolean") throw new Error("inputReady must be a boolean");
			const job = jobs.get(jobId);
			if (!job) throw new Error(`unknown job ${jobId}`);
			if (job.state !== "queued") throw new Error(`job ${jobId} is ${job.state}, cannot start`);
			if (timeMs < job.enqueueTimeMs) throw new Error(`job ${jobId} cannot start at ${timeMs} before enqueue ${job.enqueueTimeMs}`);
			if (timeMs + serviceDurationMs > 2147483647) throw new Error(`job ${jobId} start ${timeMs}+duration ${serviceDurationMs} exceeds max time ${MAX_TIME_MS}`);
			if (!cmd.inputReady) return {
				status: "waiting",
				jobId,
				reason: "INPUT_NOT_READY"
			};
			const head = queuedByFifo()[0];
			if (!head || head.jobId !== jobId) return {
				status: "waiting",
				jobId,
				reason: "NOT_HEAD"
			};
			const busy = [...jobs.values()].filter((j) => j.state === "in-service" || j.state === "output-held").length;
			const used = occupiedPositions();
			const freePosition = firstFree(positionIds, used);
			if (busy >= serviceCapacity || freePosition === null) return {
				status: "waiting",
				jobId,
				reason: "NO_CAPACITY"
			};
			const eligible = positionIds.find((id) => !used.has(id) && (positionReleasedAt.get(id) ?? -1) <= timeMs);
			if (eligible === void 0) throw new Error(`job ${jobId} cannot start at ${timeMs} before lane release ${positionReleasedAt.get(freePosition)}`);
			job.state = "in-service";
			job.queueSlotId = null;
			job.positionId = eligible;
			job.startTimeMs = timeMs;
			return {
				status: "started",
				jobId,
				positionId: eligible,
				startTimeMs: timeMs,
				waitMs: timeMs - job.enqueueTimeMs
			};
		},
		completeService: (cmd) => {
			const jobId = assertId(cmd.jobId, "jobId");
			const timeMs = assertTimeMs(cmd.timeMs, "timeMs");
			if (typeof cmd.outputBlocked !== "boolean") throw new Error("outputBlocked must be a boolean");
			const job = jobs.get(jobId);
			if (!job) throw new Error(`unknown job ${jobId}`);
			if (job.state !== "in-service") throw new Error(`job ${jobId} is ${job.state}, cannot complete`);
			const earliest = (job.startTimeMs ?? 0) + serviceDurationMs;
			if (timeMs < earliest) throw new Error(`job ${jobId} completes no earlier than ${earliest}, got ${timeMs}`);
			job.finishTimeMs = timeMs;
			if (cmd.outputBlocked) {
				job.state = "output-held";
				return {
					status: "output-held",
					jobId,
					finishTimeMs: timeMs,
					positionId: job.positionId
				};
			}
			const lane = job.positionId;
			job.state = "released";
			job.positionId = null;
			positionReleasedAt.set(lane, timeMs);
			return {
				status: "released",
				jobId,
				finishTimeMs: timeMs
			};
		},
		releaseOutput: (cmd) => {
			const jobId = assertId(cmd.jobId, "jobId");
			const timeMs = assertTimeMs(cmd.timeMs, "timeMs");
			const job = jobs.get(jobId);
			if (!job) throw new Error(`unknown job ${jobId}`);
			if (job.state !== "output-held") throw new Error(`job ${jobId} is ${job.state}, nothing held to release`);
			if (job.finishTimeMs !== null && timeMs < job.finishTimeMs) throw new Error(`job ${jobId} cannot release at ${timeMs} before finish ${job.finishTimeMs}`);
			const lane = job.positionId;
			job.state = "released";
			job.positionId = null;
			positionReleasedAt.set(lane, timeMs);
			return {
				status: "released",
				jobId
			};
		},
		snapshot: () => {
			const views = [...jobs.values()].map((j) => ({
				jobId: j.jobId,
				state: j.state,
				enqueueTimeMs: j.enqueueTimeMs,
				queueSlotId: j.queueSlotId,
				positionId: j.positionId,
				startTimeMs: j.startTimeMs,
				finishTimeMs: j.finishTimeMs,
				waitMs: j.startTimeMs === null ? null : j.startTimeMs - j.enqueueTimeMs
			})).sort((a, b) => a.enqueueTimeMs - b.enqueueTimeMs || (a.jobId < b.jobId ? -1 : 1));
			return freezeDeep$1({
				resourceId,
				serviceCapacity,
				serviceDurationMs,
				jobs: views
			});
		}
	};
}
// packages/simulation/src/travel.ts
function travelTimeMs(distanceMm, speedMmPerSecond) {
	if (!Number.isSafeInteger(distanceMm) || distanceMm < 0 || !Number.isSafeInteger(speedMmPerSecond) || speedMmPerSecond <= 0) throw new Error("travelTimeMs requires a nonnegative safe-integer distanceMm and a positive safe-integer speedMmPerSecond");
	if (distanceMm === 0) return 0;
	const result = (BigInt(distanceMm) * 1000n + BigInt(speedMmPerSecond) - 1n) / BigInt(speedMmPerSecond);
	if (result > BigInt(2147483647)) throw new Error(`travelTimeMs result exceeds the ${MAX_TIME_MS}ms simulation horizon bound`);
	return Number(result);
}
// packages/simulation/src/transport.ts
function freezeDeep(value) {
	if (Array.isArray(value)) {
		for (const item of value) freezeDeep(item);
		return Object.freeze(value);
	}
	if (typeof value === "object" && value !== null) {
		for (const key of Object.keys(value)) freezeDeep(value[key]);
		return Object.freeze(value);
	}
	return value;
}
function isXz(value) {
	if (typeof value !== "object" || value === null) return false;
	const { x, z } = value;
	return Number.isSafeInteger(x) && Number.isSafeInteger(z);
}
function completionEventId(unitIndex, version) {
	return `transport-complete-u${unitIndex}-v${version}`;
}
function cloneWaitBlocker(blocker) {
	switch (blocker.kind) {
		case "unit": return {
			kind: "unit",
			blockerUnitId: blocker.blockerUnitId,
			reason: blocker.reason
		};
		case "zone": return {
			kind: "zone",
			zoneId: blocker.zoneId,
			holderUnitId: blocker.holderUnitId,
			reason: blocker.reason
		};
		case "unknown": return {
			kind: "unknown",
			reason: blocker.reason,
			candidates: [...blocker.candidates]
		};
	}
}
function unitOrUnknownBlocker(blockerUnitId, candidateUnitIds, reason) {
	if (blockerUnitId !== void 0) return {
		kind: "unit",
		blockerUnitId,
		reason
	};
	return {
		kind: "unknown",
		reason,
		candidates: [...candidateUnitIds ?? []]
	};
}
function cloneGrantedPlan(plan) {
	return {
		...plan,
		destination: { ...plan.destination },
		points: plan.points.map((p) => ({ ...p })),
		distancesMm: [...plan.distancesMm],
		requiredZones: [...plan.requiredZones]
	};
}
function cloneTrajectory(t) {
	return {
		...t,
		segments: t.segments.map((s) => ({ ...s })),
		destination: { ...t.destination }
	};
}
function createTransportDomain(opts) {
	const scenario = opts.scenario;
	const onGrant = opts.onGrant;
	const nav = createTransportNav(scenario);
	const zones = scenario.geometry.trafficZones ?? [];
	const zoneRects = /* @__PURE__ */ new Map();
	for (const z of zones) zoneRects.set(z.id, {
		minX: z.minXMm,
		maxX: z.maxXMm,
		minZ: z.minZMm,
		maxZ: z.maxZMm
	});
	const units = /* @__PURE__ */ new Map();
	for (const u of scenario.mobileUnits) units.set(u.id, {
		unitId: u.id,
		speed: u.speedMmPerSecond,
		radius: nav.radiusForUnit(u.id),
		currentPose: {
			x: u.parkingSlotMm.x,
			z: u.parkingSlotMm.z
		},
		plan: null,
		trajectory: null,
		planVersion: 0,
		waiting: null
	});
	const unitOrder = /* @__PURE__ */ new Map();
	scenario.mobileUnits.forEach((u, i) => unitOrder.set(u.id, i));
	for (const u of scenario.mobileUnits) {
		const park = {
			x: u.parkingSlotMm.x,
			z: u.parkingSlotMm.z
		};
		const rect = nav.rectForUnitAt(u.id, park);
		const radius = nav.radiusForUnit(u.id);
		if (rect.minX < 0 || rect.minZ < 0 || rect.maxX > nav.roomMm.widthMm || rect.maxZ > nav.roomMm.depthMm) throw new Error(`initial admission rejected [INITIAL_ROOM_EXCEEDED]: unit ${u.id} declared footprint [${rect.minX}..${rect.maxX}]x[${rect.minZ}..${rect.maxZ}] at (${park.x},${park.z}) leaves the ${nav.roomMm.widthMm}x${nav.roomMm.depthMm} room`);
		for (let i = 0; i < nav.rackRects.length; i += 1) {
			const rackRect = nav.rackRects[i];
			if (rectsOverlapInterior(rect, rackRect)) throw new Error(`initial admission rejected [INITIAL_OBSTACLE_OVERLAP]: unit ${u.id} declared footprint at (${park.x},${park.z}) overlaps rack ${scenario.geometry.racks[i]?.id ?? i}`);
		}
		for (let i = 0; i < nav.obstacleRects.length; i += 1) {
			const obsRect = nav.obstacleRects[i];
			if (rectsOverlapInterior(rect, obsRect)) throw new Error(`initial admission rejected [INITIAL_OBSTACLE_OVERLAP]: unit ${u.id} declared footprint at (${park.x},${park.z}) overlaps obstacle ${scenario.geometry.obstacles[i]?.id ?? i}`);
		}
		if (park.x <= radius || park.z <= radius || park.x >= nav.roomMm.widthMm - radius || park.z >= nav.roomMm.depthMm - radius) throw new Error(`initial admission rejected [INITIAL_CLEARANCE]: unit ${u.id} center (${park.x},${park.z}) is within its ${radius}mm radius of the room wall band`);
		const inflatedHits = [];
		for (let i = 0; i < nav.rackRects.length; i += 1) if (pointInRect({
			x: park.x,
			z: park.z
		}, inflateRect(nav.rackRects[i], radius))) inflatedHits.push(`rack ${scenario.geometry.racks[i]?.id ?? i}`);
		for (let i = 0; i < nav.obstacleRects.length; i += 1) if (pointInRect({
			x: park.x,
			z: park.z
		}, inflateRect(nav.obstacleRects[i], radius))) inflatedHits.push(`obstacle ${scenario.geometry.obstacles[i]?.id ?? i}`);
		if (inflatedHits.length > 0) throw new Error(`initial admission rejected [INITIAL_CLEARANCE]: unit ${u.id} center (${park.x},${park.z}) violates ${radius}mm clearance at ${inflatedHits.join(", ")}`);
		for (const [zoneId, zoneRect] of zoneRects) if (pathRequiresZone([park], radius, zoneRect)) throw new Error(`initial admission rejected [INITIAL_IN_ZONE]: unit ${u.id} profile at (${park.x},${park.z}) intersects exclusive zone ${zoneId}; configure holding bays fully clear of zones`);
	}
	{
		const order = [...units.keys()];
		for (let i = 0; i < order.length; i += 1) {
			const aId = order[i];
			const aUnit = units.get(aId);
			const aPose = aUnit.currentPose;
			for (let j = i + 1; j < order.length; j += 1) {
				const bId = order[j];
				const bUnit = units.get(bId);
				const bPose = bUnit.currentPose;
				if (stationaryVsStationaryConflict(aPose, aUnit.radius, bPose, bUnit.radius)) {
					const dist = Math.hypot(aPose.x - bPose.x, aPose.z - bPose.z);
					throw new Error(`initial admission rejected [INITIAL_OVERLAP]: units ${aId} at (${aPose.x},${aPose.z}) r${aUnit.radius} and ${bId} at (${bPose.x},${bPose.z}) r${bUnit.radius} conflict (center ${dist}mm <= ${aUnit.radius + bUnit.radius} + EPS, same closed-contact rule as movement)`);
				}
			}
		}
	}
	let pending = [];
	let holds = [];
	const sortPending = () => {
		pending.sort((a, b) => a.requestTimeMs - b.requestTimeMs || (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0));
	};
	const currentPoses = (excludeUnitId) => {
		const m = /* @__PURE__ */ new Map();
		for (const [id, u] of units) {
			if (id === excludeUnitId) continue;
			m.set(id, { ...poseAtInternal(id, requireKernel().getClockMs()) });
		}
		return m;
	};
	let kernel = null;
	const requireKernel = () => {
		if (!kernel) throw new Error("transport domain has no bound kernel");
		return kernel;
	};
	const handleMovementCompleted = (event, api) => {
		if (event.kind !== "MOVEMENT_COMPLETED") return;
		const data = event.data;
		const unitId = typeof data?.unitId === "string" ? data.unitId : null;
		const version = typeof data?.planVersion === "number" ? data.planVersion : null;
		if (unitId === null || version === null) return;
		const u = units.get(unitId);
		if (!u || !u.plan || !u.trajectory) return;
		if (u.planVersion !== version || u.plan.planVersion !== version) return;
		if (event.taskId !== unitId) return;
		u.currentPose = { ...u.plan.destination };
		holds = holds.filter((h) => !(h.unitId === unitId && h.planVersion === version));
		u.plan = null;
		u.trajectory = null;
		retryPendingInternal();
	};
	const bindKernel = (next) => {
		kernel = next;
	};
	const poseAtInternal = (unitId, timeMs) => {
		const u = units.get(unitId);
		if (!u) throw new Error(`unknown mobile unit: ${unitId}`);
		if (!u.trajectory || !u.plan) return { ...u.currentPose };
		const traj = u.trajectory;
		if (timeMs <= traj.startMs) {
			const first = traj.segments[0];
			if (!first) return { ...u.currentPose };
			return {
				x: first.fromX,
				z: first.fromZ
			};
		}
		if (timeMs >= traj.endMs) return { ...traj.destination };
		for (const seg of traj.segments) if (timeMs >= seg.startMs && timeMs <= seg.endMs) return poseOnSegment(seg, timeMs);
		return { ...traj.destination };
	};
	const buildTrajectory = (unitId, points, distancesMm, startMs) => {
		const u = units.get(unitId);
		const segments = [];
		let t = startMs;
		for (let i = 0; i + 1 < points.length; i += 1) {
			const from = points[i];
			const to = points[i + 1];
			const dist = distancesMm[i];
			let dur;
			try {
				dur = travelTimeMs(dist, u.speed);
			} catch (err) {
				return { error: err instanceof Error ? err.message : String(err) };
			}
			const segStart = t;
			const segEnd = segStart + dur;
			if (segEnd > 2147483647) return { error: `route duration exceeds max time ${MAX_TIME_MS}` };
			segments.push({
				fromX: from.x,
				fromZ: from.z,
				toX: to.x,
				toZ: to.z,
				startMs: segStart,
				endMs: segEnd
			});
			t = segEnd;
		}
		const endMs = segments.length === 0 ? startMs : t;
		return {
			trajectory: {
				unitId,
				radiusMm: u.radius,
				segments,
				startMs,
				endMs,
				destination: { ...points[points.length - 1] }
			},
			planTimes: {
				startMs,
				endMs,
				totalDurationMs: endMs - startMs
			},
			segments
		};
	};
	const requiredZonesFor = (points, radius) => {
		const out = [];
		for (const [zoneId, rect] of zoneRects) if (pathRequiresZone(points, radius, rect)) out.push(zoneId);
		out.sort();
		return out;
	};
	const destinationInZone = (dest, radiusMm) => {
		for (const [zoneId, rect] of zoneRects) if (pathRequiresZone([dest], radiusMm, rect)) return zoneId;
		return null;
	};
	const attemptGrant = (unitId, destination, grantTimeMs, originalRequestTimeMs) => {
		const u = units.get(unitId);
		if (!u) return {
			status: "rejected",
			unitId,
			reason: {
				code: "UNKNOWN_UNIT",
				message: `unknown mobile unit: ${unitId}`
			}
		};
		if (!isXz(destination)) return {
			status: "rejected",
			unitId,
			reason: {
				code: "INVALID_DESTINATION",
				message: "destination must be safe-integer XZ mm"
			}
		};
		const insideZone = destinationInZone(destination, u.radius);
		if (insideZone) return {
			status: "rejected",
			unitId,
			reason: {
				code: "DESTINATION_IN_ZONE",
				message: `destination (${destination.x},${destination.z}) stopping envelope intersects exclusive zone ${insideZone}; configure holding bays fully clear of zones`
			}
		};
		const from = { ...poseAtInternal(unitId, grantTimeMs) };
		const others = currentPoses(unitId);
		const staticRoute = nav.findStaticRoute(from, destination, unitId);
		if (staticRoute.status === "rejected") return {
			status: "rejected",
			unitId,
			reason: {
				code: staticRoute.reason,
				message: staticRoute.message,
				blockerUnitId: staticRoute.blockerUnitId
			}
		};
		const dynRoute = nav.findRoute(from, destination, unitId, others);
		if (dynRoute.status === "rejected") {
			if (dynRoute.reason === "OCCUPIED_GOAL") return {
				status: "waiting",
				unitId,
				destination: { ...destination },
				requestTimeMs: originalRequestTimeMs,
				ageMs: grantTimeMs - originalRequestTimeMs,
				blocker: unitOrUnknownBlocker(dynRoute.blockerUnitId, dynRoute.candidateUnitIds, "OCCUPIED_GOAL")
			};
			if (dynRoute.reason === "NO_PATH") {
				const candidates = nav.blockingCandidatesOnCorridor(staticRoute.points, unitId, others);
				return {
					status: "waiting",
					unitId,
					destination: { ...destination },
					requestTimeMs: originalRequestTimeMs,
					ageMs: grantTimeMs - originalRequestTimeMs,
					blocker: candidates.length === 1 ? {
						kind: "unit",
						blockerUnitId: candidates[0],
						reason: "CORRIDOR_BLOCKED"
					} : {
						kind: "unknown",
						reason: "CORRIDOR_BLOCKED",
						candidates
					}
				};
			}
			return {
				status: "waiting",
				unitId,
				destination: { ...destination },
				requestTimeMs: originalRequestTimeMs,
				ageMs: grantTimeMs - originalRequestTimeMs,
				blocker: unitOrUnknownBlocker(dynRoute.blockerUnitId, dynRoute.candidateUnitIds, dynRoute.reason)
			};
		}
		const built = buildTrajectory(unitId, dynRoute.points, dynRoute.distancesMm, grantTimeMs);
		if ("error" in built) return {
			status: "rejected",
			unitId,
			reason: {
				code: "DURATION_OVERFLOW",
				message: built.error
			}
		};
		const { trajectory } = built;
		const requiredZones = requiredZonesFor(dynRoute.points, u.radius);
		const othersMoving = [...units.values()].filter((o) => o.unitId !== unitId && o.trajectory && o.plan).sort((a, b) => a.unitId < b.unitId ? -1 : 1);
		for (const o of othersMoving) {
			const ot = o.trajectory;
			if (trajectoriesConflict(trajectory, ot).conflict) return {
				status: "waiting",
				unitId,
				destination: { ...destination },
				requestTimeMs: originalRequestTimeMs,
				ageMs: grantTimeMs - originalRequestTimeMs,
				blocker: {
					kind: "unit",
					blockerUnitId: o.unitId,
					reason: "TRAJECTORY_CONFLICT"
				}
			};
		}
		const othersStationary = [...units.values()].filter((o) => o.unitId !== unitId && !o.trajectory).sort((a, b) => a.unitId < b.unitId ? -1 : 1);
		for (const o of othersStationary) if (trajectoryVsStationaryConflict(trajectory, o.currentPose, o.radius).conflict) {
			const destClose = stationaryVsStationaryConflict(destination, u.radius, o.currentPose, o.radius);
			return {
				status: "waiting",
				unitId,
				destination: { ...destination },
				requestTimeMs: originalRequestTimeMs,
				ageMs: grantTimeMs - originalRequestTimeMs,
				blocker: {
					kind: "unit",
					blockerUnitId: o.unitId,
					reason: destClose ? "OCCUPIED_GOAL" : "STOPPED_AGENT_IN_PATH"
				}
			};
		}
		for (const o of othersMoving) {
			const ot = o.trajectory;
			const oGoal = o.plan.destination;
			if (ot.endMs <= trajectory.endMs) {
				if (trajectoryVsStationaryInWindowConflict(trajectory, oGoal, o.radius, ot.endMs, trajectory.endMs).conflict) return {
					status: "waiting",
					unitId,
					destination: { ...destination },
					requestTimeMs: originalRequestTimeMs,
					ageMs: grantTimeMs - originalRequestTimeMs,
					blocker: {
						kind: "unit",
						blockerUnitId: o.unitId,
						reason: "TERMINAL_TAIL_CONFLICT"
					}
				};
			}
			if (trajectory.endMs <= ot.endMs) {
				if (trajectoryVsStationaryInWindowConflict(ot, destination, u.radius, trajectory.endMs, ot.endMs).conflict) return {
					status: "waiting",
					unitId,
					destination: { ...destination },
					requestTimeMs: originalRequestTimeMs,
					ageMs: grantTimeMs - originalRequestTimeMs,
					blocker: {
						kind: "unit",
						blockerUnitId: o.unitId,
						reason: "TERMINAL_TAIL_CONFLICT"
					}
				};
			}
			if (stationaryVsStationaryConflict(destination, u.radius, oGoal, o.radius)) return {
				status: "waiting",
				unitId,
				destination: { ...destination },
				requestTimeMs: originalRequestTimeMs,
				ageMs: grantTimeMs - originalRequestTimeMs,
				blocker: {
					kind: "unit",
					blockerUnitId: o.unitId,
					reason: "TERMINAL_OVERLAP"
				}
			};
		}
		for (const zoneId of requiredZones) for (const h of holds) {
			if (h.zoneId !== zoneId) continue;
			if (zoneHoldsOverlap(trajectory.startMs, trajectory.endMs, h.startMs, h.endMs)) return {
				status: "waiting",
				unitId,
				destination: { ...destination },
				requestTimeMs: originalRequestTimeMs,
				ageMs: grantTimeMs - originalRequestTimeMs,
				blocker: {
					kind: "zone",
					zoneId,
					holderUnitId: h.unitId,
					reason: "ZONE_EXCLUSIVE"
				}
			};
		}
		return {
			status: "granted",
			plan: {
				unitId,
				planVersion: u.planVersion + 1,
				destination: { ...destination },
				points: dynRoute.points.map((p) => ({ ...p })),
				distancesMm: [...dynRoute.distancesMm],
				totalDistanceMm: dynRoute.totalDistanceMm,
				totalDurationMs: trajectory.endMs - trajectory.startMs,
				startMs: trajectory.startMs,
				endMs: trajectory.endMs,
				requiredZones: [...requiredZones]
			},
			waitMs: grantTimeMs - originalRequestTimeMs
		};
	};
	const commitGrant = (unitId, granted, trajectory) => {
		const u = units.get(unitId);
		const newVersion = granted.plan.planVersion;
		if (EVENT_PRIORITY.COMPLETION > 1e6) throw new Error("completion priority exceeds kernel bound");
		if (!Number.isSafeInteger(newVersion) || newVersion < 0 || newVersion > 1e9) throw new Error(`grant plan version ${newVersion} outside 0..${MAX_PLAN_VERSION}`);
		const eventId = completionEventId(unitOrder.get(unitId), newVersion);
		requireKernel().schedule({
			id: eventId,
			timeMs: granted.plan.endMs,
			priority: EVENT_PRIORITY.COMPLETION,
			kind: "MOVEMENT_COMPLETED",
			data: {
				unitId,
				planVersion: newVersion,
				destination: { ...granted.plan.destination }
			},
			taskId: unitId,
			planVersion: newVersion
		});
		try {
			requireKernel().setTaskPlanVersion(unitId, newVersion);
		} catch (err) {
			requireKernel().cancel(eventId);
			throw err;
		}
		u.planVersion = newVersion;
		u.plan = cloneGrantedPlan(granted.plan);
		u.trajectory = trajectory;
		u.waiting = null;
		pending = pending.filter((p) => p.unitId !== unitId);
		for (const zoneId of granted.plan.requiredZones) holds.push({
			zoneId,
			unitId,
			planVersion: newVersion,
			startMs: granted.plan.startMs,
			endMs: granted.plan.endMs
		});
		if (onGrant) onGrant({
			plan: freezeDeep(cloneGrantedPlan(granted.plan)),
			trajectory: freezeDeep(cloneTrajectory(trajectory))
		});
	};
	const trajectoryForGranted = (unitId, granted) => {
		units.get(unitId);
		const built = buildTrajectory(unitId, granted.plan.points, granted.plan.distancesMm, granted.plan.startMs);
		if ("error" in built) throw new Error(`grant trajectory rebuild failed: ${built.error}`);
		return built.trajectory;
	};
	const enqueueWaiting = (unitId, destination, requestTimeMs, blocker) => {
		const u = units.get(unitId);
		u.waiting = {
			destination: { ...destination },
			requestTimeMs,
			blocker: cloneWaitBlocker(blocker)
		};
		pending = pending.filter((p) => p.unitId !== unitId);
		pending.push({
			unitId,
			destination: { ...destination },
			requestTimeMs
		});
		sortPending();
	};
	const retryPendingInternal = () => {
		const order = [...pending];
		for (const entry of order) {
			const u = units.get(entry.unitId);
			if (!u || u.plan) continue;
			const attempt = attemptGrant(entry.unitId, entry.destination, requireKernel().getClockMs(), entry.requestTimeMs);
			if (attempt.status === "granted") commitGrant(entry.unitId, attempt, trajectoryForGranted(entry.unitId, attempt));
			else if (attempt.status === "waiting") enqueueWaiting(entry.unitId, entry.destination, entry.requestTimeMs, attempt.blocker);
			else enqueueWaiting(entry.unitId, entry.destination, entry.requestTimeMs, {
				kind: "unit",
				blockerUnitId: entry.unitId,
				reason: attempt.reason.code
			});
		}
	};
	return {
		bindKernel,
		handleMovementCompleted,
		getClockMs: () => requireKernel().getClockMs(),
		getKernelStatus: () => requireKernel().getStatus(),
		requestMove: (unitId, destination, requestTimeMs) => {
			if (requireKernel().getStatus() === "invalid") throw new Error(`cannot request move: kernel is invalid (${requireKernel().snapshot().diagnostic})`);
			const clock = requireKernel().getClockMs();
			const reqTime = requestTimeMs ?? clock;
			if (!Number.isSafeInteger(reqTime) || reqTime < 0 || reqTime > 2147483647) return {
				status: "rejected",
				unitId,
				reason: {
					code: "INVALID_REQUEST_TIME",
					message: "requestTimeMs must be a safe integer in 0..MAX_TIME_MS"
				}
			};
			if (reqTime !== clock) return {
				status: "rejected",
				unitId,
				reason: {
					code: "REQUEST_TIME_MISMATCH",
					message: `requestTimeMs ${reqTime} must equal the kernel clock ${clock} (no past/future requests)`
				}
			};
			const u = units.get(unitId);
			if (!u) return {
				status: "rejected",
				unitId,
				reason: {
					code: "UNKNOWN_UNIT",
					message: `unknown mobile unit: ${unitId}`
				}
			};
			if (u.plan) return {
				status: "rejected",
				unitId,
				reason: {
					code: "ALREADY_MOVING",
					message: `unit ${unitId} has an active plan v${u.planVersion} to (${u.plan.destination.x},${u.plan.destination.z}); replan-while-moving is rejected and the old plan is preserved`
				}
			};
			const hadWaiting = u.waiting !== null;
			const oldWaiting = u.waiting ? {
				destination: { ...u.waiting.destination },
				requestTimeMs: u.waiting.requestTimeMs,
				blocker: cloneWaitBlocker(u.waiting.blocker)
			} : null;
			const attempt = attemptGrant(unitId, destination, clock, reqTime);
			if (attempt.status === "rejected") {
				if (hadWaiting && oldWaiting && !u.waiting) u.waiting = oldWaiting;
				return attempt;
			}
			if (attempt.status === "granted") {
				commitGrant(unitId, attempt, trajectoryForGranted(unitId, attempt));
				return {
					status: "granted",
					plan: freezeDeep(cloneGrantedPlan(attempt.plan)),
					waitMs: attempt.waitMs
				};
			}
			enqueueWaiting(unitId, destination, reqTime, attempt.blocker);
			return {
				status: "waiting",
				unitId,
				destination: { ...destination },
				requestTimeMs: reqTime,
				ageMs: clock - reqTime,
				blocker: cloneWaitBlocker(attempt.blocker)
			};
		},
		cancelPlan: (unitId) => {
			const u = units.get(unitId);
			if (!u) return {
				status: "rejected",
				unitId,
				reason: {
					code: "UNKNOWN_UNIT",
					message: `unknown mobile unit: ${unitId}`
				}
			};
			if (u.plan) return {
				status: "rejected",
				unitId,
				reason: {
					code: "UNSAFE_MIDROUTE",
					message: `unit ${unitId} is moving under plan v${u.planVersion}; cancellation rejected and motion continues to (${u.plan.destination.x},${u.plan.destination.z})`
				}
			};
			if (u.waiting) {
				u.waiting = null;
				pending = pending.filter((p) => p.unitId !== unitId);
				return {
					status: "cancelled",
					unitId
				};
			}
			return {
				status: "rejected",
				unitId,
				reason: {
					code: "NOTHING_TO_CANCEL",
					message: `unit ${unitId} has no active plan or waiting request`
				}
			};
		},
		poseAt: (unitId, timeMs) => {
			const t = timeMs ?? requireKernel().getClockMs();
			if (!Number.isSafeInteger(t) || t < 0 || t > 2147483647) throw new Error("poseAt timeMs must be a safe integer in 0..MAX_TIME_MS");
			return poseAtInternal(unitId, t);
		},
		snapshot: () => {
			const clock = requireKernel().getClockMs();
			return freezeDeep({
				engineVersion: OPERATIONS_ENGINE_VERSION,
				clockMs: clock,
				units: [...units.values()].sort((a, b) => a.unitId < b.unitId ? -1 : 1).map((u) => {
					const pose = poseAtInternal(u.unitId, clock);
					const state = u.plan ? "moving" : u.waiting ? "waiting" : "idle";
					return {
						unitId: u.unitId,
						pose,
						state,
						planVersion: u.planVersion,
						plan: u.plan ? {
							...u.plan,
							destination: { ...u.plan.destination },
							points: u.plan.points.map((p) => ({ ...p })),
							distancesMm: [...u.plan.distancesMm],
							requiredZones: [...u.plan.requiredZones]
						} : null,
						waiting: u.waiting ? {
							destination: { ...u.waiting.destination },
							requestTimeMs: u.waiting.requestTimeMs,
							ageMs: clock - u.waiting.requestTimeMs,
							blocker: cloneWaitBlocker(u.waiting.blocker)
						} : null
					};
				}),
				pendingCount: pending.length,
				activeCount: [...units.values()].filter((u) => u.plan).length
			});
		},
		dispatch: () => {
			if (requireKernel().getStatus() === "invalid") throw new Error("cannot dispatch: kernel is invalid");
			const order = [...pending];
			const results = [];
			for (const entry of order) {
				const u = units.get(entry.unitId);
				if (!u || u.plan) continue;
				const attempt = attemptGrant(entry.unitId, entry.destination, requireKernel().getClockMs(), entry.requestTimeMs);
				if (attempt.status === "granted") {
					commitGrant(entry.unitId, attempt, trajectoryForGranted(entry.unitId, attempt));
					results.push({
						status: "granted",
						plan: freezeDeep(cloneGrantedPlan(attempt.plan)),
						waitMs: attempt.waitMs
					});
				} else if (attempt.status === "waiting") {
					enqueueWaiting(entry.unitId, entry.destination, entry.requestTimeMs, attempt.blocker);
					results.push({
						status: "waiting",
						unitId: entry.unitId,
						destination: { ...entry.destination },
						requestTimeMs: entry.requestTimeMs,
						ageMs: requireKernel().getClockMs() - entry.requestTimeMs,
						blocker: cloneWaitBlocker(attempt.blocker)
					});
				} else {
					enqueueWaiting(entry.unitId, entry.destination, entry.requestTimeMs, {
						kind: "unit",
						blockerUnitId: entry.unitId,
						reason: attempt.reason.code
					});
					results.push({
						status: "waiting",
						unitId: entry.unitId,
						destination: { ...entry.destination },
						requestTimeMs: entry.requestTimeMs,
						ageMs: requireKernel().getClockMs() - entry.requestTimeMs,
						blocker: {
							kind: "unit",
							blockerUnitId: entry.unitId,
							reason: attempt.reason.code
						}
					});
				}
			}
			return results;
		},
		getDiagnostic: () => {
			const snap = requireKernel().snapshot();
			if (snap.status === "invalid") return {
				status: "kernel-invalid",
				detail: snap.diagnostic ?? "kernel invalid"
			};
			if (pending.length === 0) return null;
			if ([...units.values()].filter((u) => u.plan).length > 0) return null;
			for (const entry of pending) if (attemptGrant(entry.unitId, entry.destination, requireKernel().getClockMs(), entry.requestTimeMs).status === "granted") return null;
			const waits = pending.map((entry) => {
				const blocker = units.get(entry.unitId).waiting?.blocker ?? {
					kind: "unknown",
					reason: "UNKNOWN",
					candidates: []
				};
				return {
					unitId: entry.unitId,
					blocker: cloneWaitBlocker(blocker),
					ageMs: requireKernel().getClockMs() - entry.requestTimeMs
				};
			});
			const edges = /* @__PURE__ */ new Map();
			for (const w of waits) {
				if (w.blocker.kind === "unknown") continue;
				const target = w.blocker.kind === "unit" ? w.blocker.blockerUnitId : w.blocker.holderUnitId;
				edges.set(w.unitId, target);
			}
			for (const start of waits.map((w) => w.unitId)) {
				const seen = [start];
				let cur = edges.get(start);
				while (cur !== void 0 && edges.has(cur)) {
					if (cur === start) return {
						status: "stuck",
						kind: "DEADLOCK_CYCLE",
						detail: `deadlock cycle among waiting units: ${[...seen, start].join(" -> ")}; retained, no teleport or task deletion`,
						cycle: [...seen, start],
						waits
					};
					if (seen.includes(cur)) break;
					seen.push(cur);
					cur = edges.get(cur);
				}
			}
			const unknownCount = waits.filter((w) => w.blocker.kind === "unknown").length;
			const unknownNote = unknownCount > 0 ? `; ${unknownCount} wait(s) have unknown/multiple causes (no invented edges)` : "";
			return {
				status: "stuck",
				kind: "IMPOSSIBLE_WAIT",
				detail: `${pending.length} waiting, 0 moving, 0 grantable now and no future release scheduled; retained for operator dispatch (no teleport/task deletion)${unknownNote}`,
				waits
			};
		}
	};
}
// packages/simulation/src/operations.ts
var operationsExecutionConfigSchema = strictObject({
	pickDurationMsPerItem: number().int().min(1).max(MAX_SERVICE_DURATION_MS),
	unloadDurationMsPerItem: number().int().min(1).max(MAX_SERVICE_DURATION_MS)
});
function parseOperationsExecutionConfig(value) {
	return operationsExecutionConfigSchema.parse(value);
}
var DEFAULT_OPERATIONS_SAFETY_CEILING_MS = 72e5;
function operationsRunMetrics(snapshot, completionStage) {
	const totalWaitMs = snapshot.waits.reduce((n, w) => n + Math.max(0, (w.endMs ?? snapshot.clockMs) - w.startMs), 0);
	const shippedTimes = snapshot.orders.map((o) => o.timestamps.SHIPPED).filter((t) => typeof t === "number");
	const lastShippedAtMs = shippedTimes.length > 0 ? Math.max(...shippedTimes) : null;
	return {
		totalWaitMs,
		makespanMs: completionStage === "SUPPORTED_STAGE_COMPLETE" && snapshot.counts.selected > 0 && snapshot.counts.shipped === snapshot.counts.selected ? lastShippedAtMs : null,
		lastShippedAtMs
	};
}
function runOperationsToTermination(controller, safetyCeilingMs = DEFAULT_OPERATIONS_SAFETY_CEILING_MS) {
	if (!Number.isSafeInteger(safetyCeilingMs) || safetyCeilingMs < 1 || safetyCeilingMs > 2147483647) throw new Error(`safetyCeilingMs must be an integer in 1..${MAX_TIME_MS}`);
	const run = controller.exportReport().scenario.policies.run;
	const mode = run.mode;
	const horizonMs = mode === "fixed-window" ? run.horizonMs : null;
	const arrivalCutoffMs = mode === "finite-cohort" ? run.arrivalCutoffMs : null;
	let stopReason = "caller-stopped";
	for (let guard = 0; guard < 1e5; guard += 1) {
		const stage = controller.getCompletionStatus().stage;
		const clock = controller.getClockMs();
		if (stage === "SUPPORTED_STAGE_COMPLETE") {
			stopReason = "stage-complete";
			break;
		}
		if (stage === "BLOCKED") {
			stopReason = "blocked";
			break;
		}
		if (stage === "WINDOW_ENDED") {
			stopReason = "window-ended";
			break;
		}
		if (clock >= safetyCeilingMs) {
			stopReason = "safety-ceiling";
			break;
		}
		const target = mode === "fixed-window" ? Math.min(horizonMs, safetyCeilingMs) : Math.min(clock + 6e4, safetyCeilingMs);
		if (target <= clock) {
			stopReason = mode === "fixed-window" && safetyCeilingMs >= horizonMs ? "window-ended" : "safety-ceiling";
			break;
		}
		controller.advanceTo(target);
		if (controller.getClockMs() <= clock) {
			stopReason = "no-progress";
			break;
		}
	}
	return {
		mode,
		horizonMs,
		arrivalCutoffMs,
		safetyCeilingMs,
		stopClockMs: controller.getClockMs(),
		stopReason
	};
}
function recomputeOperationsReport(report) {
	const mismatches = [];
	const fail = (stage, counts, clock) => ({
		ok: false,
		recomputedStage: stage,
		recomputedCounts: counts,
		recomputedClockMs: clock,
		mismatches
	});
	if (!report || typeof report !== "object") {
		mismatches.push("report must be an object");
		return fail("UNKNOWN", report?.counts, 0);
	}
	if (report.schema !== "layoutlab.operations-report/1") {
		mismatches.push(`unsupported report schema ${String(report.schema)}`);
		return fail("UNKNOWN", report.counts, 0);
	}
	let scenario;
	try {
		scenario = parseOperationsScenario(report.scenario);
	} catch (e) {
		mismatches.push(`scenario: ${e instanceof Error ? e.message : "invalid scenario"}`);
		return fail("UNKNOWN", report.counts, 0);
	}
	try {
		parseOperationsExecutionConfig(report.executionConfig);
	} catch (e) {
		mismatches.push(`executionConfig: ${e instanceof Error ? e.message : "invalid execution config"}`);
		return fail("UNKNOWN", report.counts, 0);
	}
	if (report.scenarioId !== scenario.id) mismatches.push(`scenarioId: report ${String(report.scenarioId)} != scenario ${scenario.id}`);
	if (report.seed !== scenario.seed) mismatches.push(`seed: report ${String(report.seed)} != scenario ${scenario.seed}`);
	const expectedVersions = {
		simulation: SIMULATION_VERSION,
		operationsSchema: OPERATIONS_SCHEMA_VERSION,
		operationsEngine: OPERATIONS_ENGINE_VERSION
	};
	for (const key of Object.keys(expectedVersions)) if (report.versions?.[key] !== expectedVersions[key]) mismatches.push(`versions.${key}: report ${String(report.versions?.[key])} != current ${expectedVersions[key]}`);
	const hasClock = typeof report.clockMs === "number" && Number.isSafeInteger(report.clockMs);
	if (!hasClock) mismatches.push("clockMs: missing E3 clock evidence (legacy report not fully verifiable)");
	if (!report.termination) mismatches.push("termination: missing E3 termination evidence (legacy report not fully verifiable)");
	if (report.totalWaitMs === void 0) mismatches.push("totalWaitMs: missing E3 metric evidence (legacy report not fully verifiable)");
	if (report.makespanMs === void 0) mismatches.push("makespanMs: missing E3 metric evidence (legacy report not fully verifiable)");
	if (report.lastShippedAtMs === void 0) mismatches.push("lastShippedAtMs: missing E3 metric evidence (legacy report not fully verifiable)");
	let c;
	try {
		c = createOperationsController({
			scenario: report.scenario,
			executionConfig: report.executionConfig
		});
	} catch (e) {
		mismatches.push(`run: ${e instanceof Error ? e.message : "controller failed"}`);
		return fail("UNKNOWN", report.counts, 0);
	}
	if (hasClock) {
		if (report.clockMs > 0) c.advanceTo(report.clockMs);
	} else runOperationsToTermination(c);
	const s = c.snapshot();
	const stage = c.getCompletionStatus().stage;
	const rc = s.counts;
	if (s.scenarioId !== scenario.id) mismatches.push(`recomputed scenarioId ${s.scenarioId} != scenario ${scenario.id}`);
	if (s.seed !== scenario.seed) mismatches.push(`recomputed seed ${s.seed} != scenario ${scenario.seed}`);
	if (hasClock && s.clockMs !== report.clockMs) mismatches.push(`clockMs: report ${String(report.clockMs)} != recomputed ${s.clockMs}`);
	const countKeys = Object.keys(rc);
	for (const key of countKeys) if (report.counts?.[key] !== rc[key]) mismatches.push(`counts.${key}: report ${String(report.counts?.[key])} != recomputed ${rc[key]}`);
	for (const key of Object.keys(report.counts ?? {})) if (!countKeys.includes(key)) mismatches.push(`counts.${key}: unexpected saved count key`);
	if (stage !== report.completionStage) mismatches.push(`completionStage: report ${String(report.completionStage)} != recomputed ${stage}`);
	const sameTimestamps = (a, b) => {
		const keys = /* @__PURE__ */ new Set([...Object.keys(a), ...Object.keys(b)]);
		for (const k of keys) if (a[k] !== b[k]) return false;
		return true;
	};
	const checkRows = (label, saved, fresh, requireTimestamps) => {
		const savedIds = /* @__PURE__ */ new Set();
		for (const row of saved) {
			if (savedIds.has(row.id)) mismatches.push(`${label} ${row.id}: duplicate saved row`);
			savedIds.add(row.id);
		}
		const freshById = new Map(fresh.map((r) => [r.id, r]));
		for (const row of saved) {
			const r = freshById.get(row.id);
			if (!r) {
				mismatches.push(`${label} ${row.id}: missing on recomputation`);
				continue;
			}
			if (r.state !== row.state) mismatches.push(`${label} ${row.id}: report ${row.state} != recomputed ${r.state}`);
			if (row.timestamps === void 0) {
				if (requireTimestamps) mismatches.push(`${label} ${row.id}: missing timestamps evidence`);
			} else if (!sameTimestamps(row.timestamps, r.timestamps)) mismatches.push(`${label} ${row.id}: timestamps report ${JSON.stringify(row.timestamps)} != recomputed ${JSON.stringify(r.timestamps)}`);
		}
		for (const r of fresh) if (!savedIds.has(r.id)) mismatches.push(`${label} ${r.id}: missing in saved report`);
	};
	checkRows("order", (report.orders ?? []).map((o) => ({
		id: o.orderId,
		state: o.state,
		timestamps: o.timestamps
	})), s.orders.map((o) => ({
		id: o.orderId,
		state: o.state,
		timestamps: o.timestamps
	})), true);
	checkRows("delivery", (report.deliveries ?? []).map((d) => ({
		id: d.deliveryId,
		state: d.state,
		timestamps: d.timestamps
	})), s.deliveries.map((d) => ({
		id: d.deliveryId,
		state: d.state,
		timestamps: d.timestamps
	})), true);
	const metrics = operationsRunMetrics(s, stage);
	if (report.totalWaitMs !== void 0 && report.totalWaitMs !== metrics.totalWaitMs) mismatches.push(`totalWaitMs: report ${String(report.totalWaitMs)} != recomputed ${metrics.totalWaitMs}`);
	if (report.makespanMs !== void 0 && report.makespanMs !== metrics.makespanMs) mismatches.push(`makespanMs: report ${String(report.makespanMs)} != recomputed ${String(metrics.makespanMs)}`);
	if (report.lastShippedAtMs !== void 0 && report.lastShippedAtMs !== metrics.lastShippedAtMs) mismatches.push(`lastShippedAtMs: report ${String(report.lastShippedAtMs)} != recomputed ${String(metrics.lastShippedAtMs)}`);
	for (const key of [
		"conservation",
		"capacity",
		"safety"
	]) {
		const savedChecks = report.checks?.[key];
		if (!Array.isArray(savedChecks) || JSON.stringify(savedChecks) !== JSON.stringify(s.checks[key])) mismatches.push(`checks.${key}: report ${JSON.stringify(savedChecks)} != recomputed ${JSON.stringify(s.checks[key])}`);
	}
	if (report.termination) {
		const t = report.termination;
		const run = scenario.policies.run;
		if (t.mode !== run.mode) mismatches.push(`termination.mode: report ${String(t.mode)} != scenario ${run.mode}`);
		const wantHorizon = run.mode === "fixed-window" ? run.horizonMs : null;
		const wantCutoff = run.mode === "finite-cohort" ? run.arrivalCutoffMs : null;
		if (t.horizonMs !== wantHorizon) mismatches.push(`termination.horizonMs: report ${String(t.horizonMs)} != scenario ${String(wantHorizon)}`);
		if (t.arrivalCutoffMs !== wantCutoff) mismatches.push(`termination.arrivalCutoffMs: report ${String(t.arrivalCutoffMs)} != scenario ${String(wantCutoff)}`);
		if (hasClock && t.stopClockMs !== report.clockMs) mismatches.push(`termination.stopClockMs: report ${String(t.stopClockMs)} != clockMs ${String(report.clockMs)}`);
		if (t.stopClockMs !== s.clockMs) mismatches.push(`termination.stopClockMs: report ${String(t.stopClockMs)} != recomputed clock ${s.clockMs}`);
		if (t.safetyCeilingMs !== null && (typeof t.safetyCeilingMs !== "number" || !Number.isSafeInteger(t.safetyCeilingMs) || t.safetyCeilingMs < 1 || t.safetyCeilingMs > 2147483647)) mismatches.push(`termination.safetyCeilingMs: invalid ceiling ${String(t.safetyCeilingMs)}`);
		const STOP_REASONS = [
			"stage-complete",
			"blocked",
			"window-ended",
			"safety-ceiling",
			"no-progress",
			"caller-stopped"
		];
		if (t.stopReason === void 0) mismatches.push("termination.stopReason: missing declared stop reason");
		else if (!STOP_REASONS.includes(t.stopReason)) mismatches.push(`termination.stopReason: invalid stop reason ${String(t.stopReason)}`);
		if (t.safetyCeilingMs === void 0) mismatches.push("termination.safetyCeilingMs: missing declared ceiling (null means caller drove the clock)");
		if (typeof t.stopClockMs !== "number" || !Number.isSafeInteger(t.stopClockMs)) mismatches.push(`termination.stopClockMs: missing or invalid stop clock ${String(t.stopClockMs)}`);
		if (typeof t.safetyCeilingMs === "number" && typeof t.stopClockMs === "number" && t.safetyCeilingMs < t.stopClockMs) mismatches.push(`termination.safetyCeilingMs: ceiling ${t.safetyCeilingMs} is below the actual stop clock ${t.stopClockMs} (impossible ceiling)`);
		if (t.stopReason === "safety-ceiling") {
			if (typeof t.safetyCeilingMs !== "number") mismatches.push("termination: stopReason safety-ceiling requires a numeric safetyCeilingMs");
			else if (t.safetyCeilingMs !== t.stopClockMs) mismatches.push(`termination: safety-ceiling stop must land on its ceiling ${t.safetyCeilingMs}, saved stop clock is ${String(t.stopClockMs)}`);
		}
		if (typeof t.safetyCeilingMs === "number" && Number.isSafeInteger(t.safetyCeilingMs) && t.safetyCeilingMs >= 1 && t.safetyCeilingMs <= 2147483647) try {
			const driven = runOperationsToTermination(createOperationsController({
				scenario: report.scenario,
				executionConfig: report.executionConfig
			}), t.safetyCeilingMs);
			if (driven.stopClockMs !== t.stopClockMs) mismatches.push(`termination.stopClockMs: declared ${String(t.stopClockMs)} != driver-reconstructed ${driven.stopClockMs} at ceiling ${t.safetyCeilingMs}`);
			if (driven.stopReason !== t.stopReason) mismatches.push(`termination.stopReason: declared ${String(t.stopReason)} != driver-reconstructed ${driven.stopReason} at ceiling ${t.safetyCeilingMs}`);
		} catch (e) {
			mismatches.push(`termination: driver reconstruction failed: ${e instanceof Error ? e.message : "unknown"}`);
		}
		if (t.safetyCeilingMs === null && (t.stopReason === "no-progress" || t.stopReason === "safety-ceiling")) mismatches.push(`termination.stopReason: ${String(t.stopReason)} cannot be asserted without run-driver evidence (declare a numeric safetyCeilingMs)`);
		const reasonForStage = stage === "SUPPORTED_STAGE_COMPLETE" ? ["stage-complete"] : stage === "BLOCKED" ? ["blocked"] : stage === "WINDOW_ENDED" ? ["window-ended"] : [
			"safety-ceiling",
			"no-progress",
			"caller-stopped"
		];
		if (STOP_REASONS.includes(t.stopReason) && !reasonForStage.includes(t.stopReason)) mismatches.push(`termination.stopReason: saved ${String(t.stopReason)} is inconsistent with recomputed stage ${stage}`);
	}
	return {
		ok: mismatches.length === 0,
		recomputedStage: stage,
		recomputedCounts: rc,
		recomputedClockMs: s.clockMs,
		mismatches
	};
}
function posesEqual(a, b) {
	return a.x === b.x && a.z === b.z;
}
function deepFreezeAccepted(value) {
	if (Array.isArray(value)) {
		for (const item of value) deepFreezeAccepted(item);
		return Object.freeze(value);
	}
	if (typeof value === "object" && value !== null) {
		for (const key of Object.keys(value)) deepFreezeAccepted(value[key]);
		return Object.freeze(value);
	}
	return value;
}
function createOperationsController(opts) {
	const executionConfig = deepFreezeAccepted(parseOperationsExecutionConfig(structuredClone(opts.executionConfig)));
	const scenario = deepFreezeAccepted(parseOperationsScenario(structuredClone(opts.scenario)));
	const packingConfigs = scenario.resources.filter((r) => r.kind === "packing");
	if (packingConfigs.length === 0) throw new Error("M3b slice requires at least one packing resource");
	for (const cfg of packingConfigs) if (cfg.servicePositions.length > 1 || cfg.serviceCapacity > 1) throw new Error(`unsupported capability [UNSUPPORTED_MULTILANE]: M3b is single-lane-per-packing-station; resource ${cfg.id} advertises ${cfg.servicePositions.length} service position(s) / capacity ${cfg.serviceCapacity}; split lanes into separate single-lane stations or await per-position admission`);
	const productCost = /* @__PURE__ */ new Map();
	const productClass = /* @__PURE__ */ new Map();
	for (const p of scenario.products) {
		productCost.set(p.id, p.capacityCostUnits);
		productClass.set(p.id, p.handlingClass);
	}
	const locationApproach = /* @__PURE__ */ new Map();
	for (const l of scenario.locations) locationApproach.set(l.id, {
		x: l.approachPointMm.x,
		z: l.approachPointMm.z
	});
	const unitCapacity = /* @__PURE__ */ new Map();
	const unitParking = /* @__PURE__ */ new Map();
	const unitRadius = /* @__PURE__ */ new Map();
	for (const u of scenario.mobileUnits) {
		unitCapacity.set(u.id, u.loadCapacityUnits);
		unitParking.set(u.id, {
			x: u.parkingSlotMm.x,
			z: u.parkingSlotMm.z
		});
		unitRadius.set(u.id, footprintRadiusMm(u.footprintMm));
	}
	const packingConfigById = new Map(packingConfigs.map((r) => [r.id, r]));
	const dispatchConfigs = scenario.resources.filter((r) => r.kind === "dispatch");
	for (const cfg of dispatchConfigs) if (cfg.servicePositions.length > 1 || cfg.serviceCapacity > 1) throw new Error(`unsupported capability [UNSUPPORTED_MULTILANE]: dispatch is single-lane-per-station; resource ${cfg.id} advertises ${cfg.servicePositions.length} service position(s) / capacity ${cfg.serviceCapacity}; split lanes into separate single-lane stations or await per-position admission`);
	const dispatchConfigById = new Map(dispatchConfigs.map((r) => [r.id, r]));
	const receivingConfigs = scenario.resources.filter((r) => r.kind === "receiving");
	for (const cfg of receivingConfigs) if (cfg.servicePositions.length > 1 || cfg.serviceCapacity > 1) throw new Error(`unsupported capability [UNSUPPORTED_MULTILANE]: receiving is single-lane-per-station; resource ${cfg.id} advertises ${cfg.servicePositions.length} service position(s) / capacity ${cfg.serviceCapacity}`);
	const receivingConfigById = new Map(receivingConfigs.map((r) => [r.id, r]));
	if (scenario.deliverySchedule.length > 0 && receivingConfigs.length === 0) throw new Error("unsupported capability [UNSUPPORTED_DELIVERIES]: scenario schedules inbound deliveries but configures no receiving resource");
	const runMode = scenario.policies.run.mode === "finite-cohort" ? "finite-cohort" : "fixed-window";
	const cutoffMs = scenario.policies.run.mode === "finite-cohort" ? scenario.policies.run.arrivalCutoffMs : null;
	const horizonMs = scenario.policies.run.mode === "fixed-window" ? scenario.policies.run.horizonMs : null;
	const selectedSpecs = scenario.orderSchedule.map((o, idx) => ({
		spec: o,
		idx
	})).filter(({ spec }) => cutoffMs === null || spec.arrivalTimeMs <= cutoffMs);
	const excludedOrderIds = scenario.orderSchedule.filter((o) => cutoffMs !== null && o.arrivalTimeMs > cutoffMs).map((o) => o.id);
	const fifoSelected = [...selectedSpecs].sort((a, b) => a.spec.arrivalTimeMs - b.spec.arrivalTimeMs || (a.spec.id < b.spec.id ? -1 : a.spec.id > b.spec.id ? 1 : 0));
	const orderCostOf = (lines) => lines.reduce((n, l) => n + (productCost.get(l.productId) ?? 0) * l.quantity, 0);
	const initState = () => {
		const grantHandler = { current: null };
		const pendingPurpose = /* @__PURE__ */ new Map();
		const seenGrants = /* @__PURE__ */ new Set();
		const domain = createTransportDomain({
			scenario,
			onGrant: (grant) => grantHandler.current?.(grant)
		});
		const store = createInventoryStore(scenario);
		const orders = /* @__PURE__ */ new Map();
		for (const { spec, idx } of selectedSpecs) {
			const lines = spec.lines.map((l) => ({
				productId: l.productId,
				quantity: l.quantity
			}));
			orders.set(spec.id, {
				idx,
				orderId: spec.id,
				arrivalTimeMs: spec.arrivalTimeMs,
				lines,
				created: false,
				state: "CREATED",
				timestamps: {},
				diagnostic: null,
				reserveAttempt: 0,
				shortages: [],
				legs: [],
				legsDone: 0,
				unitId: null,
				packingResourceId: null,
				dispatchResourceId: null,
				jobId: null,
				queueSlotId: null,
				queueRequestMs: null,
				jobEnqueued: false,
				partialTrips: 0,
				dispatchJobId: null,
				dispatchEnqueued: false,
				unloadCommitted: false,
				packed: false,
				totalCostUnits: orderCostOf(lines),
				totalItems: lines.reduce((n, l) => n + l.quantity, 0),
				eligibleChecked: false,
				waitReason: null
			});
		}
		const units = /* @__PURE__ */ new Map();
		for (const u of scenario.mobileUnits) units.set(u.id, {
			unitId: u.id,
			role: u.role,
			task: { kind: "idle" }
		});
		const resources = /* @__PURE__ */ new Map();
		for (const cfg of packingConfigs) {
			const queueCoords = /* @__PURE__ */ new Map();
			for (const q of cfg.queueSlots) queueCoords.set(q.id, {
				x: q.x,
				z: q.z
			});
			const serviceCoords = /* @__PURE__ */ new Map();
			for (const s of cfg.servicePositions) serviceCoords.set(s.id, {
				x: s.x,
				z: s.z
			});
			resources.set(cfg.id, {
				resourceId: cfg.id,
				station: createServiceStation(cfg),
				approachingJobId: null,
				packedOutput: /* @__PURE__ */ new Map(),
				outputUsed: 0,
				queueCoords,
				serviceCoords
			});
		}
		const S = {
			kernel: null,
			domain,
			store,
			orders,
			units,
			resources,
			dispatchStations: new Map(dispatchConfigs.map((cfg) => [cfg.id, createServiceStation(cfg)])),
			receivingStations: new Map(receivingConfigs.map((cfg) => [cfg.id, createServiceStation(cfg)])),
			receivingCoords: new Map(receivingConfigs.map((cfg) => [cfg.id, {
				x: cfg.servicePositions[0].x,
				z: cfg.servicePositions[0].z
			}])),
			deliveries: new Map(scenario.deliverySchedule.map((d, idx) => [d.id, {
				idx,
				deliveryId: d.id,
				arrivalTimeMs: d.arrivalTimeMs,
				lines: d.lines.map((l) => ({ ...l })),
				created: false,
				state: "RECEIVING",
				timestamps: {},
				receivingResourceId: null,
				receivingJobId: null,
				jobEnqueued: false,
				serviceDone: false,
				waitReason: null
			}])),
			timeline: [],
			waits: [],
			trajectories: [],
			maxConcurrentMoving: {
				count: 0,
				atMs: null
			},
			dispatchSeq: 0,
			dispatchPending: false,
			timelineSeq: 0
		};
		const record = (timeMs, kind, orderId, unitId, detail) => {
			S.timelineSeq += 1;
			S.timeline.push({
				seq: S.timelineSeq,
				timeMs,
				kind,
				orderId,
				unitId,
				detail
			});
		};
		const openWait = (unitId, orderId, reason, detail, startMs) => {
			const open = S.waits.find((w) => w.endMs === null && w.reason === reason && w.unitId === unitId && w.orderId === orderId);
			if (open) {
				open.detail = detail;
				return;
			}
			closeWaitsFor(unitId, orderId, startMs);
			S.waits.push({
				unitId,
				orderId,
				reason,
				detail,
				startMs,
				endMs: null
			});
		};
		const closeWaitsFor = (unitId, orderId, endMs) => {
			for (const w of S.waits) {
				if (w.endMs !== null) continue;
				if (unitId !== null && w.unitId === unitId) w.endMs = endMs;
				else if (orderId !== null && w.orderId === orderId && w.unitId === null) w.endMs = endMs;
			}
		};
		const closeTrafficWaitsFor = (unitId, endMs) => {
			for (const w of S.waits) {
				if (w.endMs !== null) continue;
				if (w.unitId === unitId && w.reason === "TRAFFIC") w.endMs = endMs;
			}
		};
		const noteConcurrency = (now) => {
			const active = S.domain.snapshot().activeCount;
			if (active > S.maxConcurrentMoving.count) S.maxConcurrentMoving = {
				count: active,
				atMs: now
			};
		};
		const retainGrantedTrajectory = (unitId, planVersion, orderId, purpose, trajectory) => {
			S.trajectories.push({
				unitId,
				planVersion,
				orderId,
				purpose,
				trajectory: {
					unitId: trajectory.unitId,
					radiusMm: trajectory.radiusMm,
					segments: trajectory.segments.map((s) => ({ ...s })),
					startMs: trajectory.startMs,
					endMs: trajectory.endMs,
					destination: { ...trajectory.destination }
				}
			});
		};
		grantHandler.current = (grant) => {
			const key = `${grant.plan.unitId}:v${grant.plan.planVersion}`;
			if (seenGrants.has(key)) return;
			seenGrants.add(key);
			const pending = pendingPurpose.get(grant.plan.unitId);
			pendingPurpose.delete(grant.plan.unitId);
			const orderId = pending?.orderId ?? null;
			const purpose = pending?.purpose ?? "transport-grant";
			retainGrantedTrajectory(grant.plan.unitId, grant.plan.planVersion, orderId, purpose, grant.trajectory);
			noteConcurrency(grant.plan.startMs);
			closeTrafficWaitsFor(grant.plan.unitId, grant.plan.startMs);
			record(grant.plan.startMs, "MOTION_GRANTED", orderId, grant.plan.unitId, `v${grant.plan.planVersion} ${purpose} ${grant.plan.startMs}..${grant.plan.endMs} -> (${grant.plan.destination.x},${grant.plan.destination.z})`);
		};
		const requestDispatch = (now) => {
			if (S.dispatchPending) return;
			S.dispatchPending = true;
			S.dispatchSeq += 1;
			S.kernel.schedule({
				id: `ops-dispatch-${S.dispatchSeq}`,
				timeMs: now,
				priority: EVENT_PRIORITY.DISPATCH,
				kind: "OPERATIONS_DISPATCH",
				data: { seq: S.dispatchSeq }
			});
		};
		const transition = (rt, next, now, unitId, detail) => {
			rt.state = next;
			rt.timestamps[next] = now;
			record(now, next, rt.orderId, unitId, detail);
		};
		const diagnose = (rt, code, message, terminal, now) => {
			rt.diagnostic = {
				code,
				message,
				terminal
			};
			record(now, "DIAGNOSTIC", rt.orderId, rt.unitId, `${code}: ${message}`);
		};
		const eligiblePickersFor = (rt) => {
			const out = [];
			for (const u of scenario.mobileUnits) {
				if (u.role !== "picker") continue;
				let ok = true;
				for (const line of rt.lines) {
					const cls = productClass.get(line.productId);
					if (!cls || !u.eligibleHandlingClasses.includes(cls)) {
						ok = false;
						break;
					}
				}
				if (ok) out.push(u.id);
			}
			out.sort();
			return out;
		};
		const transportUnitById = (unitId) => {
			const found = S.domain.snapshot().units.find((u) => u.unitId === unitId);
			if (!found) throw new Error(`unknown mobile unit: ${unitId}`);
			return found;
		};
		const isUnitFree = (unitId) => {
			const t = S.units.get(unitId);
			if (!t || t.task.kind !== "idle") return false;
			return transportUnitById(unitId).state === "idle";
		};
		const tryStealForAssignment = (unitId) => {
			const t = S.units.get(unitId);
			if (!t) return false;
			if (t.task.kind === "idle") return transportUnitById(unitId).state === "idle";
			if (t.task.kind !== "to-parking" && t.task.kind !== "to-vacate") return false;
			if (transportUnitById(unitId).state !== "waiting") return false;
			if (S.domain.cancelPlan(unitId).status !== "cancelled") return false;
			pendingPurpose.delete(unitId);
			t.task = { kind: "idle" };
			closeWaitsFor(unitId, null, S.kernel.getClockMs());
			return true;
		};
		const requestUnitMove = (unitId, dest, now, orderId, purpose) => {
			pendingPurpose.set(unitId, {
				orderId,
				purpose
			});
			const res = S.domain.requestMove(unitId, {
				x: dest.x,
				z: dest.z
			});
			if (res.status === "granted") return { status: "granted" };
			if (res.status === "waiting") {
				const b = res.blocker;
				const detail = b.kind === "unit" ? `traffic wait on unit ${b.blockerUnitId} (${b.reason})` : b.kind === "zone" ? `traffic wait on zone ${b.zoneId} held by ${b.holderUnitId} (${b.reason})` : `traffic wait (${b.reason}; candidates ${b.candidates.join(",") || "none"})`;
				openWait(unitId, orderId, "TRAFFIC", detail, now);
				return { status: "waiting" };
			}
			pendingPurpose.delete(unitId);
			return {
				status: "rejected",
				reason: `${res.reason.code}: ${res.reason.message}`
			};
		};
		const packingLoadOf = (resourceId) => {
			let active = 0;
			for (const rt of S.orders.values()) if (rt.packingResourceId === resourceId && rt.state !== "READY_FOR_DISPATCH") active += 1;
			return { active };
		};
		const choosePackingResource = () => {
			return [...S.resources.keys()].map((id) => ({
				id,
				active: packingLoadOf(id).active
			})).sort((a, b) => a.active - b.active || (a.id < b.id ? -1 : 1))[0].id;
		};
		const laneBusy = (res) => res.station.snapshot().jobs.some((j) => j.state === "in-service" || j.state === "output-held");
		const queuedHeadJobId = (res) => {
			return res.station.snapshot().jobs.filter((j) => j.state === "queued").sort((a, b) => a.enqueueTimeMs - b.enqueueTimeMs || (a.jobId < b.jobId ? -1 : 1))[0]?.jobId ?? null;
		};
		const runDispatch = (now) => {
			for (const { spec } of fifoSelected) {
				const rt = S.orders.get(spec.id);
				if (!rt.created || rt.legs.length > 0 || rt.diagnostic?.terminal) continue;
				if (!rt.eligibleChecked) {
					rt.eligibleChecked = true;
					const eligible = eligiblePickersFor(rt);
					if (eligible.length === 0) {
						diagnose(rt, "NO_ELIGIBLE_PICKER", `no picker role covers all handling classes of order ${rt.orderId}; held, no stock touched`, true, now);
						continue;
					}
					const maxItemCost = Math.max(...rt.lines.map((l) => productCost.get(l.productId) ?? 0));
					if (!eligible.some((id) => (unitCapacity.get(id) ?? 0) >= maxItemCost)) {
						diagnose(rt, "UNSUPPORTED_SINGLE_TRIP_REQUIRED", `order ${rt.orderId} has items costing ${maxItemCost} handling-cost units; no eligible picker can carry even one item; held with zero reservation`, true, now);
						continue;
					}
				}
				rt.reserveAttempt += 1;
				const res = S.store.reserveOrder({
					eventId: `inv-reserve-${rt.idx}-${rt.reserveAttempt}`,
					timeMs: now,
					orderId: rt.orderId
				});
				if (res.status === "waiting") {
					rt.shortages = res.shortages;
					if (rt.state !== "WAITING_FOR_STOCK") transition(rt, "WAITING_FOR_STOCK", now, null, `short: ${res.shortages.map((s) => `${s.productId} need ${s.requested} have ${s.available}`).join("; ")}`);
					rt.waitReason = "WAITING_FOR_STOCK";
					openWait(null, rt.orderId, "WAITING_FOR_STOCK", `short: ${res.shortages.map((s) => `${s.productId} ${s.available}/${s.requested}`).join("; ")}`, now);
					continue;
				}
				closeWaitsFor(null, rt.orderId, now);
				rt.waitReason = null;
				rt.legs = res.sources.map((s) => {
					const approach = locationApproach.get(s.locationId);
					if (!approach) throw new Error(`reservation references unknown location ${s.locationId}`);
					return {
						locationId: s.locationId,
						productId: s.productId,
						quantity: s.quantity,
						approach: { ...approach },
						committed: false
					};
				});
				transition(rt, "READY_FOR_PICKING", now, null, `reserved ${rt.legs.length} source leg(s)`);
			}
			for (const { spec } of fifoSelected) {
				const rt = S.orders.get(spec.id);
				if (!rt.created || rt.state !== "READY_FOR_PICKING" || rt.unitId !== null || rt.diagnostic?.terminal) continue;
				const maxItemCost = Math.max(...rt.lines.map((l) => productCost.get(l.productId) ?? 0));
				const candidates = eligiblePickersFor(rt).filter((id) => (unitCapacity.get(id) ?? 0) >= maxItemCost && (isUnitFree(id) || tryStealForAssignment(id)));
				if (candidates.length === 0) {
					rt.waitReason = "NO_IDLE_PICKER";
					openWait(null, rt.orderId, "NO_IDLE_PICKER", "all eligible pickers are tasked; FIFO age retained", now);
					continue;
				}
				const unitId = candidates[0];
				rt.unitId = unitId;
				{
					const cap = unitCapacity.get(unitId) ?? 0;
					const chunked = [];
					for (const leg of rt.legs) {
						const cost = productCost.get(leg.productId) ?? 0;
						const perTrip = cost > 0 ? Math.max(1, Math.floor(cap / cost)) : leg.quantity;
						let remaining = leg.quantity;
						while (remaining > 0) {
							const qty = Math.min(remaining, perTrip);
							chunked.push({
								...leg,
								quantity: qty,
								committed: false
							});
							remaining -= qty;
						}
					}
					rt.legs = chunked;
				}
				closeWaitsFor(null, rt.orderId, now);
				rt.waitReason = null;
				transition(rt, "PICKING", now, unitId, `assigned ${unitId}`);
				const first = rt.legs[0];
				const unit = S.units.get(unitId);
				unit.task = {
					kind: "to-pick",
					orderId: rt.orderId,
					legIndex: 0
				};
				const pose = transportUnitById(unitId).pose;
				if (posesEqual(pose, first.approach)) {
					unit.task = {
						kind: "picking",
						orderId: rt.orderId,
						legIndex: 0
					};
					schedulePickCompletion(unitId, rt, 0, now);
					continue;
				}
				const mv = requestUnitMove(unitId, first.approach, now, rt.orderId, `pick-leg-0:${first.locationId}`);
				if (mv.status === "rejected") {
					unit.task = { kind: "idle" };
					rt.unitId = null;
					diagnose(rt, "UNREACHABLE_APPROACH", `static route to ${first.locationId} approach rejected (${mv.reason}); order held, no partial pick continues`, true, now);
				}
			}
			for (const unit of S.units.values()) {
				const t = unit.task;
				if (t.kind === "awaiting-queue-slot") {
					const rt = S.orders.get(t.orderId);
					const res = S.resources.get(t.resourceId);
					tryEnqueue(rt, res, now);
				} else if (t.kind === "awaiting-head") {
					const rt = S.orders.get(t.orderId);
					const res = S.resources.get(t.resourceId);
					releaseToQueue(rt, res, now);
				} else if (t.kind === "in-queue") attemptServiceApproach(t.orderId, t.resourceId, now);
				else if (t.kind === "awaiting-staging") {
					const rt = S.orders.get(t.orderId);
					tryUnloadCommit(unit.unitId, rt, t.resourceId, now);
				} else if (t.kind === "awaiting-service-start") {
					const rt = S.orders.get(t.orderId);
					tryServiceStart(unit.unitId, rt, t.resourceId, now);
				}
			}
			for (const rt of S.orders.values()) {
				if (rt.state !== "PACKING" || rt.packed || !rt.packingResourceId) continue;
				if ((S.resources.get(rt.packingResourceId)?.station.snapshot().jobs.find((j) => j.jobId === rt.jobId))?.state === "output-held") tryPackCommit(rt, now);
			}
			tryAdvanceReceiving(now);
			tryAdvancePutAway(now);
			tryAdvanceDispatch(now);
			const pendingPickWork = [...S.orders.values()].some((rt) => rt.created && rt.state === "READY_FOR_PICKING" && rt.unitId === null && !rt.diagnostic?.terminal);
			const pendingPutAwayWork = [...S.deliveries.values()].some((d) => d.created && (d.state === "PUTAWAY_PENDING" || d.state === "PUTAWAY") && deliveryReceivingRemaining(d.deliveryId) > 0);
			if (!pendingPickWork) for (const unit of S.units.values()) {
				if (unit.role !== "picker" || unit.task.kind !== "idle") continue;
				const home = unitParking.get(unit.unitId);
				const pose = transportUnitById(unit.unitId).pose;
				if (posesEqual(pose, home)) continue;
				const standingOn = [...S.resources.values()].find((res) => [...res.serviceCoords.values()].some((p) => posesEqual(pose, p)));
				if (standingOn) {
					const held = new Set(standingOn.station.snapshot().jobs.filter((j) => j.state === "queued").map((j) => j.queueSlotId).filter((id) => id !== null));
					const freeSlot = [...standingOn.queueCoords.entries()].filter(([id]) => !held.has(id)).sort(([a], [b]) => a < b ? -1 : 1)[0];
					if (freeSlot) {
						const [slotId, dest] = freeSlot;
						unit.task = {
							kind: "to-vacate",
							resourceId: standingOn.resourceId,
							slotId
						};
						record(now, "VACATE_DEPART", null, unit.unitId, `leaving ${standingOn.resourceId} service for slot ${slotId}`);
						if (requestUnitMove(unit.unitId, dest, now, null, `vacate:${slotId}`).status === "rejected") unit.task = { kind: "idle" };
						continue;
					}
				}
				unit.task = { kind: "to-parking" };
				const mv = requestUnitMove(unit.unitId, home, now, null, "parking-return");
				if (mv.status !== "granted" && mv.status !== "waiting") unit.task = { kind: "idle" };
			}
			if (!pendingPutAwayWork) for (const unit of S.units.values()) {
				if (unit.role !== "putaway" || unit.task.kind !== "idle") continue;
				const home = unitParking.get(unit.unitId);
				const pose = transportUnitById(unit.unitId).pose;
				if (posesEqual(pose, home)) continue;
				unit.task = { kind: "to-parking" };
				const mv = requestUnitMove(unit.unitId, home, now, null, "parking-return");
				if (mv.status !== "granted" && mv.status !== "waiting") unit.task = { kind: "idle" };
			}
		};
		const schedulePickCompletion = (unitId, rt, legIndex, now) => {
			const leg = rt.legs[legIndex];
			const at = now + leg.quantity * executionConfig.pickDurationMsPerItem;
			if (at > 2147483647) {
				diagnose(rt, "TIME_BOUND_EXCEEDED", `pick handling for ${rt.orderId} leg ${legIndex} exceeds the ${MAX_TIME_MS}ms horizon bound; held with stock safe`, true, now);
				return;
			}
			record(now, "PICK_STARTED", rt.orderId, unitId, `${leg.productId}x${leg.quantity} at ${leg.locationId}`);
			S.kernel.schedule({
				id: `ops-pick-${rt.idx}-${legIndex}`,
				timeMs: at,
				priority: EVENT_PRIORITY.COMPLETION,
				kind: "HANDLING_COMPLETED",
				data: {
					unitId,
					orderIdx: rt.idx,
					handling: "pick",
					legIndex
				}
			});
		};
		const scheduleUnloadCompletion = (unitId, rt, resourceId, now) => {
			const carriedItems = (S.store.snapshot().carried.find((c) => c.unitId === unitId)?.loads ?? []).reduce((n, l) => n + l.quantity, 0);
			const at = now + carriedItems * executionConfig.unloadDurationMsPerItem;
			if (at > 2147483647) {
				diagnose(rt, "TIME_BOUND_EXCEEDED", `unload handling for ${rt.orderId} exceeds the ${MAX_TIME_MS}ms horizon bound; held with load safe`, true, now);
				return;
			}
			record(now, "UNLOAD_STARTED", rt.orderId, unitId, `${carriedItems} carried item(s) at ${resourceId}`);
			S.kernel.schedule({
				id: `ops-unload-${rt.idx}-t${rt.partialTrips}`,
				timeMs: at,
				priority: EVENT_PRIORITY.COMPLETION,
				kind: "HANDLING_COMPLETED",
				data: {
					unitId,
					orderIdx: rt.idx,
					handling: "unload",
					resourceId
				}
			});
		};
		const firstServicePosition = (res) => {
			return { ...[...res.serviceCoords.values()][0] };
		};
		const tryEnqueue = (rt, res, now) => {
			const unitId = rt.unitId;
			const unit = S.units.get(unitId);
			if (!rt.jobId) {
				rt.jobId = `pack-${rt.idx}`;
				rt.queueRequestMs = now;
			}
			if (rt.jobEnqueued) return;
			const resEnqueue = res.station.enqueue({
				jobId: rt.jobId,
				enqueueTimeMs: rt.queueRequestMs
			});
			if (resEnqueue.status === "waiting-outside") {
				unit.task = {
					kind: "awaiting-queue-slot",
					orderId: rt.orderId,
					resourceId: res.resourceId
				};
				rt.waitReason = "QUEUE_FULL";
				openWait(unitId, rt.orderId, "QUEUE_FULL", `${res.resourceId} queue holds ${resEnqueue.reason.queued}/${resEnqueue.reason.queueSlots}; holding position with ${rt.totalItems} carried item(s)`, now);
				return;
			}
			if (resEnqueue.queueSlotId === null) {
				rt.jobEnqueued = true;
				rt.queueSlotId = null;
				record(now, "DIRECT_ENQUEUED", rt.orderId, unitId, `${rt.jobId} -> ${res.resourceId} direct service (no queue slot)`);
				unit.task = {
					kind: "awaiting-head",
					orderId: rt.orderId,
					resourceId: res.resourceId
				};
				attemptDirectServiceApproach(rt, res, now);
				return;
			}
			rt.jobEnqueued = true;
			rt.queueSlotId = resEnqueue.queueSlotId;
			record(now, "QUEUE_ENQUEUED", rt.orderId, unitId, `${rt.jobId} -> ${res.resourceId} slot ${resEnqueue.queueSlotId}`);
			unit.task = {
				kind: "awaiting-head",
				orderId: rt.orderId,
				resourceId: res.resourceId
			};
			releaseToQueue(rt, res, now);
		};
		const releaseToQueue = (rt, res, now) => {
			const unitId = rt.unitId;
			const unit = S.units.get(unitId);
			if (unit.task.kind !== "awaiting-head") return;
			if (rt.jobEnqueued && rt.queueSlotId === null) {
				attemptDirectServiceApproach(rt, res, now);
				return;
			}
			if (queuedHeadJobId(res) !== rt.jobId) {
				rt.waitReason = "AWAITING_HEAD";
				openWait(unitId, rt.orderId, "AWAITING_HEAD", `holding outside ${res.resourceId}; head job is ${queuedHeadJobId(res) ?? "none"}`, now);
				return;
			}
			rt.waitReason = null;
			closeWaitsFor(unitId, rt.orderId, now);
			const slot = res.queueCoords.get(rt.queueSlotId);
			unit.task = {
				kind: "to-queue",
				orderId: rt.orderId,
				resourceId: res.resourceId,
				slotId: rt.queueSlotId
			};
			const pose = transportUnitById(unitId).pose;
			if (posesEqual(pose, slot)) {
				unit.task = {
					kind: "in-queue",
					orderId: rt.orderId,
					resourceId: res.resourceId,
					slotId: rt.queueSlotId
				};
				record(now, "QUEUE_ARRIVED", rt.orderId, unitId, `already at ${rt.queueSlotId}`);
				attemptServiceApproach(rt.orderId, res.resourceId, now);
				return;
			}
			const mv = requestUnitMove(unitId, slot, now, rt.orderId, `queue:${rt.jobId}`);
			if (mv.status === "rejected") {
				unit.task = {
					kind: "awaiting-head",
					orderId: rt.orderId,
					resourceId: res.resourceId
				};
				diagnose(rt, "UNREACHABLE_QUEUE", `static route to ${res.resourceId} slot ${rt.queueSlotId} rejected (${mv.reason}); held with load safe`, true, now);
			}
		};
		const attemptDirectServiceApproach = (rt, res, now) => {
			const unitId = rt.unitId;
			const unit = S.units.get(unitId);
			if (unit.task.kind !== "awaiting-head") return;
			if (queuedHeadJobId(res) !== rt.jobId) {
				rt.waitReason = "AWAITING_HEAD";
				openWait(unitId, rt.orderId, "AWAITING_HEAD", `holding upstream of ${res.resourceId}; head job is ${queuedHeadJobId(res) ?? "none"}`, now);
				return;
			}
			if (laneBusy(res)) {
				const holder = res.station.snapshot().jobs.find((j) => j.state === "in-service" || j.state === "output-held")?.jobId ?? "unknown";
				rt.waitReason = "BUSY_STATION";
				openWait(unitId, rt.orderId, "BUSY_STATION", `${res.resourceId} lane held by ${holder}; holding upstream with ${rt.totalItems} carried item(s)`, now);
				return;
			}
			if (res.approachingJobId !== null && res.approachingJobId !== rt.jobId) {
				rt.waitReason = "APPROACH_RESERVED";
				openWait(unitId, rt.orderId, "APPROACH_RESERVED", `${res.resourceId} approach reserved by ${res.approachingJobId}`, now);
				return;
			}
			res.approachingJobId = rt.jobId;
			rt.waitReason = null;
			closeWaitsFor(unitId, rt.orderId, now);
			const dest = firstServicePosition(res);
			record(now, "SERVICE_APPROACH", rt.orderId, unitId, `${rt.jobId} -> ${res.resourceId} service position direct (no queue)`);
			unit.task = {
				kind: "to-service",
				orderId: rt.orderId,
				resourceId: res.resourceId
			};
			const pose = transportUnitById(unitId).pose;
			if (posesEqual(pose, dest)) {
				unit.task = {
					kind: "unloading",
					orderId: rt.orderId,
					resourceId: res.resourceId
				};
				scheduleUnloadCompletion(unitId, rt, res.resourceId, now);
				return;
			}
			const mv = requestUnitMove(unitId, dest, now, rt.orderId, `service-direct:${rt.jobId}`);
			if (mv.status === "rejected") {
				res.approachingJobId = null;
				unit.task = {
					kind: "awaiting-head",
					orderId: rt.orderId,
					resourceId: res.resourceId
				};
				diagnose(rt, "UNREACHABLE_SERVICE", `static route to ${res.resourceId} service position rejected (${mv.reason}); held upstream with load safe`, true, now);
			}
		};
		const attemptServiceApproach = (orderId, resourceId, now) => {
			const rt = S.orders.get(orderId);
			const res = S.resources.get(resourceId);
			const unitId = rt.unitId;
			const unit = S.units.get(unitId);
			if (unit.task.kind !== "in-queue") return;
			const head = queuedHeadJobId(res);
			if (head !== rt.jobId) {
				rt.waitReason = "QUEUED_BEHIND_HEAD";
				openWait(unitId, orderId, "QUEUED_BEHIND_HEAD", `head job is ${head ?? "none"}; FIFO age retained`, now);
				return;
			}
			if (laneBusy(res)) {
				const holder = res.station.snapshot().jobs.find((j) => j.state === "in-service" || j.state === "output-held")?.jobId ?? "unknown";
				rt.waitReason = "BUSY_STATION";
				openWait(unitId, orderId, "BUSY_STATION", `${resourceId} lane held by ${holder}; holding queue slot ${rt.queueSlotId}`, now);
				return;
			}
			if (res.approachingJobId !== null && res.approachingJobId !== rt.jobId) {
				rt.waitReason = "APPROACH_RESERVED";
				openWait(unitId, orderId, "APPROACH_RESERVED", `${resourceId} approach reserved by ${res.approachingJobId}`, now);
				return;
			}
			res.approachingJobId = rt.jobId;
			rt.waitReason = null;
			closeWaitsFor(unitId, orderId, now);
			const dest = firstServicePosition(res);
			record(now, "SERVICE_APPROACH", orderId, unitId, `${rt.jobId} -> ${resourceId} service position`);
			unit.task = {
				kind: "to-service",
				orderId,
				resourceId
			};
			const pose = transportUnitById(unitId).pose;
			if (posesEqual(pose, dest)) {
				unit.task = {
					kind: "unloading",
					orderId,
					resourceId
				};
				scheduleUnloadCompletion(unitId, rt, resourceId, now);
				return;
			}
			const mv = requestUnitMove(unitId, dest, now, orderId, `service:${rt.jobId}`);
			if (mv.status === "rejected") {
				res.approachingJobId = null;
				unit.task = {
					kind: "in-queue",
					orderId,
					resourceId,
					slotId: rt.queueSlotId
				};
				diagnose(rt, "UNREACHABLE_SERVICE", `static route to ${resourceId} service position rejected (${mv.reason}); held in queue with load safe`, true, now);
			}
		};
		const packingStagedUnits = (resourceId) => {
			let total = 0;
			for (const row of S.store.snapshot().packing) {
				if (row.resourceId !== resourceId) continue;
				total += (productCost.get(row.productId) ?? 0) * row.quantity;
			}
			return total;
		};
		const tryUnloadCommit = (unitId, rt, resourceId, now) => {
			if (rt.unloadCommitted || rt.state !== "WAITING_FOR_PACKING") return;
			const unit = S.units.get(unitId);
			if (unit.task.kind !== "unloading" && unit.task.kind !== "awaiting-staging") return;
			const cfg = packingConfigById.get(resourceId);
			if (!cfg) return;
			const loads = (S.store.snapshot().carried.find((c) => c.unitId === unitId)?.loads ?? []).filter((l) => l.quantity > 0);
			const carriedItems = loads.reduce((n, l) => n + l.quantity, 0);
			const carriedCost = loads.reduce((n, l) => n + (productCost.get(l.productId) ?? 0) * l.quantity, 0);
			if (carriedItems === 0) return;
			const staged = packingStagedUnits(resourceId);
			if (staged + carriedCost > cfg.inputStagingCapacity) {
				unit.task = {
					kind: "awaiting-staging",
					orderId: rt.orderId,
					resourceId
				};
				rt.waitReason = "PACKING_STAGING_FULL";
				openWait(unitId, rt.orderId, "PACKING_STAGING_FULL", `${resourceId} staging ${staged}/${cfg.inputStagingCapacity} cost units; load needs ${carriedCost}; holding service position with load`, now);
				return;
			}
			loads.forEach((load) => {
				S.store.transferToPacking({
					eventId: `inv-xfer-${rt.idx}-t${rt.partialTrips}-${load.productId}`,
					timeMs: now,
					orderId: rt.orderId,
					unitId,
					resourceId,
					productId: load.productId,
					quantity: load.quantity
				});
			});
			rt.waitReason = null;
			closeWaitsFor(unitId, rt.orderId, now);
			if (rt.legsDone < rt.legs.length) {
				rt.partialTrips += 1;
				record(now, "PARTIAL_UNLOAD_COMMITTED", rt.orderId, unitId, `trip ${rt.partialTrips}: ${carriedItems} item(s) staged at ${resourceId}; ${rt.legs.length - rt.legsDone} leg(s) remain`);
				const next = rt.legs[rt.legsDone];
				const pose = transportUnitById(unitId).pose;
				unit.task = {
					kind: "to-pick",
					orderId: rt.orderId,
					legIndex: rt.legsDone
				};
				if (posesEqual(pose, next.approach)) {
					unit.task = {
						kind: "picking",
						orderId: rt.orderId,
						legIndex: rt.legsDone
					};
					schedulePickCompletion(unitId, rt, rt.legsDone, now);
					return;
				}
				const mv = requestUnitMove(unitId, next.approach, now, rt.orderId, `pick-leg-${rt.legsDone}:${next.locationId}`);
				if (mv.status === "rejected") diagnose(rt, "UNREACHABLE_APPROACH", `static route back to ${next.locationId} approach rejected (${mv.reason}); staged load retained`, true, now);
				return;
			}
			rt.unloadCommitted = true;
			record(now, "UNLOAD_COMMITTED", rt.orderId, unitId, `all ${rt.totalItems} item(s) staged at ${resourceId}`);
			tryServiceStart(unitId, rt, resourceId, now);
		};
		const tryServiceStart = (unitId, rt, resourceId, now) => {
			const res = S.resources.get(resourceId);
			const unit = S.units.get(unitId);
			if (!rt.unloadCommitted || !rt.jobEnqueued) return;
			if (!S.store.packingReadiness(rt.orderId, resourceId).ready) {
				unit.task = {
					kind: "awaiting-service-start",
					orderId: rt.orderId,
					resourceId
				};
				rt.waitReason = "INPUT_NOT_READY";
				openWait(unitId, rt.orderId, "INPUT_NOT_READY", "staged input incomplete; cannot start service", now);
				return;
			}
			const started = res.station.tryStart({
				jobId: rt.jobId,
				timeMs: now,
				inputReady: true
			});
			if (started.status === "waiting") {
				unit.task = {
					kind: "awaiting-service-start",
					orderId: rt.orderId,
					resourceId
				};
				rt.waitReason = `SERVICE_WAIT_${started.reason}`;
				openWait(unitId, rt.orderId, `SERVICE_WAIT_${started.reason}`, `service start deferred (${started.reason})`, now);
				return;
			}
			if (res.approachingJobId === rt.jobId) res.approachingJobId = null;
			rt.queueSlotId = null;
			unit.task = { kind: "idle" };
			rt.waitReason = null;
			closeWaitsFor(unitId, rt.orderId, now);
			record(now, "SERVICE_STARTED", rt.orderId, unitId, `${rt.jobId} at ${resourceId} position ${started.positionId} after ${started.waitMs}ms queue wait`);
			transition(rt, "PACKING", now, null, `service started at ${resourceId}`);
			const at = now + (packingConfigById.get(resourceId)?.serviceDurationMs ?? 0);
			if (at > 2147483647) {
				diagnose(rt, "TIME_BOUND_EXCEEDED", `packing service for ${rt.orderId} exceeds the ${MAX_TIME_MS}ms horizon bound; lane retained`, true, now);
				return;
			}
			S.kernel.schedule({
				id: `ops-pack-${rt.idx}`,
				timeMs: at,
				priority: EVENT_PRIORITY.COMPLETION,
				kind: "PACK_COMPLETED",
				data: {
					orderIdx: rt.idx,
					resourceId
				}
			});
			requestDispatch(now);
		};
		const tryPackCommit = (rt, now) => {
			if (rt.state !== "PACKING" || rt.packed || !rt.packingResourceId) return;
			const res = S.resources.get(rt.packingResourceId);
			const job = res.station.snapshot().jobs.find((j) => j.jobId === rt.jobId);
			if (!job || job.state !== "in-service" && job.state !== "output-held") return;
			const cfg = packingConfigById.get(res.resourceId);
			const cap = cfg?.outputStagingCapacity ?? 0;
			if (job.state === "in-service") {
				if (now < (job.startTimeMs ?? 0) + (cfg?.serviceDurationMs ?? 0)) return;
			}
			if (res.outputUsed + rt.totalCostUnits > cap) {
				if (job.state === "in-service") {
					res.station.completeService({
						jobId: rt.jobId,
						timeMs: now,
						outputBlocked: true
					});
					record(now, "OUTPUT_HELD", rt.orderId, null, `${res.resourceId} output ${res.outputUsed}/${cap}; order needs ${rt.totalCostUnits}`);
				}
				rt.waitReason = "OUTPUT_BLOCKED";
				openWait(null, rt.orderId, "OUTPUT_BLOCKED", `${res.resourceId} output staging ${res.outputUsed}/${cap} cost units; no dispatch drain in M3b; lane retained with stock safe`, now);
				return;
			}
			if (job.state === "in-service") res.station.completeService({
				jobId: rt.jobId,
				timeMs: now,
				outputBlocked: false
			});
			else {
				S.store.packOrder({
					eventId: `inv-pack-${rt.idx}`,
					timeMs: now,
					orderId: rt.orderId,
					resourceId: res.resourceId
				});
				res.station.releaseOutput({
					jobId: rt.jobId,
					timeMs: now
				});
				rt.packed = true;
				res.packedOutput.set(rt.orderId, rt.totalCostUnits);
				res.outputUsed += rt.totalCostUnits;
				rt.waitReason = null;
				closeWaitsFor(null, rt.orderId, now);
				record(now, "PACK_COMMITTED", rt.orderId, null, `packed at ${res.resourceId} after output hold`);
				transition(rt, "READY_FOR_DISPATCH", now, null, `packed ${rt.totalItems} item(s); finite output staging, not shipped`);
				requestDispatch(now);
				return;
			}
			S.store.packOrder({
				eventId: `inv-pack-${rt.idx}`,
				timeMs: now,
				orderId: rt.orderId,
				resourceId: res.resourceId
			});
			rt.packed = true;
			res.packedOutput.set(rt.orderId, rt.totalCostUnits);
			res.outputUsed += rt.totalCostUnits;
			rt.waitReason = null;
			closeWaitsFor(null, rt.orderId, now);
			record(now, "PACK_COMMITTED", rt.orderId, null, `packed at ${res.resourceId}`);
			transition(rt, "READY_FOR_DISPATCH", now, null, `packed ${rt.totalItems} item(s); finite output staging, not shipped`);
			requestDispatch(now);
		};
		const tryAdvanceDispatch = (now) => {
			if (S.dispatchStations.size === 0) return;
			const ready = [...S.orders.values()].filter((o) => o.created && o.state === "READY_FOR_DISPATCH" && o.packed).sort((a, b) => (a.timestamps.READY_FOR_DISPATCH ?? 0) - (b.timestamps.READY_FOR_DISPATCH ?? 0) || a.idx - b.idx);
			for (const rt of ready) {
				if (!rt.dispatchEnqueued) {
					let bestId = null;
					let bestLoad = Number.POSITIVE_INFINITY;
					for (const [id, station] of S.dispatchStations) {
						const load = station.snapshot().jobs.filter((j) => j.state === "queued" || j.state === "in-service").length;
						if (load < bestLoad || load === bestLoad && (bestId === null || id < bestId)) {
							bestId = id;
							bestLoad = load;
						}
					}
					if (bestId === null) return;
					const station = S.dispatchStations.get(bestId);
					const jobId = `dsp-job-${rt.idx}`;
					if (station.enqueue({
						jobId,
						enqueueTimeMs: now
					}).status === "waiting-outside") {
						rt.waitReason = "DISPATCH_QUEUE_FULL";
						openWait(null, rt.orderId, "DISPATCH_QUEUE_FULL", `dispatch queues full; packed output retained at ${rt.packingResourceId}`, now);
						continue;
					}
					rt.dispatchEnqueued = true;
					rt.dispatchJobId = jobId;
					rt.dispatchResourceId = bestId;
					record(now, "DISPATCH_QUEUED", rt.orderId, null, `queued on ${bestId}`);
				}
				const station = S.dispatchStations.get(rt.dispatchResourceId);
				const job = station.snapshot().jobs.find((j) => j.jobId === rt.dispatchJobId);
				if (!job || job.state !== "queued") continue;
				if (station.snapshot().jobs.filter((j) => j.state === "queued").sort((a, b) => a.enqueueTimeMs - b.enqueueTimeMs || (a.jobId < b.jobId ? -1 : 1))[0]?.jobId !== rt.dispatchJobId) {
					rt.waitReason = "DISPATCH_QUEUED_BEHIND_HEAD";
					continue;
				}
				const started = station.tryStart({
					jobId: rt.dispatchJobId,
					timeMs: now,
					inputReady: true
				});
				if (started.status === "waiting") {
					rt.waitReason = `DISPATCH_WAIT_${started.reason}`;
					continue;
				}
				rt.waitReason = null;
				closeWaitsFor(null, rt.orderId, now);
				record(now, "DISPATCH_STARTED", rt.orderId, null, `${rt.dispatchJobId} at ${rt.dispatchResourceId} position ${started.positionId}`);
				const at = now + (dispatchConfigById.get(rt.dispatchResourceId)?.serviceDurationMs ?? 0);
				if (at > 2147483647) {
					diagnose(rt, "TIME_BOUND_EXCEEDED", `dispatch service for ${rt.orderId} exceeds the ${MAX_TIME_MS}ms horizon bound; packed output retained`, true, now);
					continue;
				}
				S.kernel.schedule({
					id: `ops-dispatch-done-${rt.idx}`,
					timeMs: at,
					priority: EVENT_PRIORITY.COMPLETION,
					kind: "DISPATCH_COMPLETED",
					data: { orderIdx: rt.idx }
				});
			}
		};
		const onDispatchCompleted = (event, now) => {
			const data = event.data;
			const orderIdx = typeof data?.orderIdx === "number" ? data.orderIdx : null;
			if (orderIdx === null) return;
			const spec = scenario.orderSchedule[orderIdx];
			const rt = spec ? S.orders.get(spec.id) : void 0;
			if (!rt || !rt.created) {
				record(now, "STALE_IGNORED", null, null, "dispatch completion for unknown order; no mutation");
				return;
			}
			const station = rt.dispatchResourceId ? S.dispatchStations.get(rt.dispatchResourceId) : void 0;
			const job = station?.snapshot().jobs.find((j) => j.jobId === rt.dispatchJobId);
			if (rt.state !== "READY_FOR_DISPATCH" || !rt.packed || !station || !job || job.state !== "in-service") {
				record(now, "STALE_IGNORED", rt.orderId, null, "unexpected dispatch completion; no mutation");
				return;
			}
			station.completeService({
				jobId: rt.dispatchJobId,
				timeMs: now,
				outputBlocked: false
			});
			S.store.dispatchOrder({
				eventId: `inv-dispatch-${rt.idx}`,
				timeMs: now,
				orderId: rt.orderId
			});
			if (rt.packingResourceId) {
				const res = S.resources.get(rt.packingResourceId);
				if (res && res.packedOutput.has(rt.orderId)) {
					res.packedOutput.delete(rt.orderId);
					res.outputUsed -= rt.totalCostUnits;
				}
			}
			rt.waitReason = null;
			closeWaitsFor(null, rt.orderId, now);
			transition(rt, "SHIPPED", now, null, `dispatched via ${rt.dispatchResourceId}; goods left the warehouse`);
			requestDispatch(now);
		};
		const deliverToPacking = (unitId, rt, now) => {
			if (rt.state === "PICKING") transition(rt, "WAITING_FOR_PACKING", now, unitId, `carrying load toward packing (trip ${rt.partialTrips + 1})`);
			if (!rt.packingResourceId) rt.packingResourceId = choosePackingResource();
			const res = S.resources.get(rt.packingResourceId);
			if (!rt.jobEnqueued) {
				tryEnqueue(rt, res, now);
				return;
			}
			const unit = S.units.get(unitId);
			unit.task = {
				kind: "awaiting-head",
				orderId: rt.orderId,
				resourceId: res.resourceId
			};
			releaseToQueue(rt, res, now);
		};
		const receivingStagedCost = (resourceId) => {
			let total = 0;
			for (const row of S.store.snapshot().receiving) {
				if (row.resourceId !== resourceId) continue;
				total += (productCost.get(row.productId) ?? 0) * row.quantity;
			}
			return total;
		};
		const deliveryExternalRemaining = (deliveryId) => {
			let total = 0;
			for (const row of S.store.snapshot().externalPending) if (row.deliveryId === deliveryId) total += row.quantity;
			return total;
		};
		const deliveryReceivingRemaining = (deliveryId) => {
			let total = 0;
			for (const row of S.store.snapshot().receiving) if (row.deliveryId === deliveryId) total += row.quantity;
			return total;
		};
		const tryAcceptInbound = (dt, now) => {
			const resourceId = dt.receivingResourceId;
			const cfg = receivingConfigById.get(resourceId);
			if (!cfg) return false;
			let staged = receivingStagedCost(resourceId);
			for (const line of dt.lines) {
				const pending = S.store.snapshot().externalPending.find((r) => r.deliveryId === dt.deliveryId && r.productId === line.productId)?.quantity ?? 0;
				if (pending <= 0) continue;
				const cost = productCost.get(line.productId) ?? 0;
				const fits = cost > 0 ? Math.max(0, Math.floor((cfg.outputStagingCapacity - staged) / cost)) : pending;
				const qty = Math.min(pending, fits);
				if (qty <= 0) continue;
				S.store.acceptInbound({
					eventId: `inv-accept-${dt.idx}-${line.productId}-${now}`,
					timeMs: now,
					deliveryId: dt.deliveryId,
					resourceId,
					productId: line.productId,
					quantity: qty
				});
				staged += cost * qty;
				record(now, "INBOUND_ACCEPTED", null, null, `${dt.deliveryId} ${line.productId}x${qty} into ${resourceId} staging`);
			}
			return deliveryExternalRemaining(dt.deliveryId) === 0;
		};
		const finishReceivingIfAccepted = (dt, now) => {
			if (!dt.serviceDone || dt.state !== "RECEIVING") return;
			if (!tryAcceptInbound(dt, now)) {
				dt.waitReason = "RECEIVING_STAGING_FULL";
				openWait(null, null, "RECEIVING_STAGING_FULL", `${dt.deliveryId} waits for receiving staging space`, now);
				return;
			}
			const station = S.receivingStations.get(dt.receivingResourceId);
			const job = station?.snapshot().jobs.find((j) => j.jobId === dt.receivingJobId);
			if (station && job?.state === "in-service") station.completeService({
				jobId: dt.receivingJobId,
				timeMs: now,
				outputBlocked: false
			});
			dt.waitReason = null;
			closeWaitsFor(null, null, now);
			dt.state = "PUTAWAY_PENDING";
			dt.timestamps.PUTAWAY_PENDING = now;
			record(now, "RECEIVING_DONE", null, null, `${dt.deliveryId} fully accepted; put-away pending`);
			requestDispatch(now);
		};
		const tryAdvanceReceiving = (now) => {
			for (const dt of S.deliveries.values()) {
				if (!dt.created || dt.state !== "RECEIVING") continue;
				if (dt.serviceDone) {
					finishReceivingIfAccepted(dt, now);
					continue;
				}
				if (!dt.jobEnqueued) {
					let bestId = null;
					let bestLoad = Number.POSITIVE_INFINITY;
					for (const [id, station] of S.receivingStations) {
						const load = station.snapshot().jobs.filter((j) => j.state === "queued" || j.state === "in-service").length;
						if (load < bestLoad || load === bestLoad && (bestId === null || id < bestId)) {
							bestId = id;
							bestLoad = load;
						}
					}
					if (bestId === null) return;
					const station = S.receivingStations.get(bestId);
					const jobId = `rcv-job-${dt.idx}`;
					if (station.enqueue({
						jobId,
						enqueueTimeMs: now
					}).status === "waiting-outside") {
						dt.waitReason = "RECEIVING_QUEUE_FULL";
						continue;
					}
					dt.jobEnqueued = true;
					dt.receivingJobId = jobId;
					dt.receivingResourceId = bestId;
					record(now, "RECEIVING_QUEUED", null, null, `${dt.deliveryId} queued on ${bestId}`);
				}
				const station = S.receivingStations.get(dt.receivingResourceId);
				const job = station.snapshot().jobs.find((j) => j.jobId === dt.receivingJobId);
				if (!job || job.state !== "queued") continue;
				const started = station.tryStart({
					jobId: dt.receivingJobId,
					timeMs: now,
					inputReady: true
				});
				if (started.status === "waiting") {
					dt.waitReason = `RECEIVING_WAIT_${started.reason}`;
					continue;
				}
				dt.waitReason = null;
				record(now, "RECEIVING_STARTED", null, null, `${dt.deliveryId} at ${dt.receivingResourceId}`);
				const at = now + (receivingConfigById.get(dt.receivingResourceId)?.serviceDurationMs ?? 0);
				if (at > 2147483647) continue;
				S.kernel.schedule({
					id: `ops-receive-done-${dt.idx}`,
					timeMs: at,
					priority: EVENT_PRIORITY.COMPLETION,
					kind: "RECEIVE_COMPLETED",
					data: { deliveryIdx: dt.idx }
				});
			}
		};
		const carriedCostOf = (unitId) => {
			const row = S.store.snapshot().carried.find((c) => c.unitId === unitId);
			let total = 0;
			for (const load of row?.loads ?? []) total += (productCost.get(load.productId) ?? 0) * load.quantity;
			return total;
		};
		const closePutAwayWait = (unitId, endMs) => {
			for (const w of S.waits) if (w.endMs === null && w.unitId === unitId && w.reason === "PUTAWAY_NO_LOCATION") w.endMs = endMs;
		};
		const freeAtLocation = (locationId, productId) => {
			const cfg = scenario.locations.find((l) => l.id === locationId);
			if (!cfg) return 0;
			const slot = S.store.snapshot().storage.find((r) => r.locationId === locationId);
			if (!slot) return 0;
			if (slot.productId !== null && slot.productId !== productId) return 0;
			return Math.max(0, cfg.maxQuantity - slot.quantity);
		};
		const placeableQty = (productId, desired) => {
			for (let q = Math.min(desired, Number.MAX_SAFE_INTEGER); q >= 1; q -= 1) {
				if (q > desired) continue;
				if (S.store.selectPutAwayLocation(productId, q).status === "selectable") return q;
			}
			return 0;
		};
		const stagedRowsInDeliveryOrder = (dt, resourceId) => {
			const order = new Map(dt.lines.map((l, i) => [l.productId, i]));
			return S.store.snapshot().receiving.filter((r) => r.deliveryId === dt.deliveryId && r.quantity > 0 && (resourceId === void 0 || r.resourceId === resourceId)).sort((a, b) => (order.get(a.productId) ?? 999) - (order.get(b.productId) ?? 999) || (a.productId < b.productId ? -1 : 1));
		};
		const choosePlaceableCollect = (dt, unitId, resourceId) => {
			const capacity = unitCapacity.get(unitId) ?? 0;
			const carried = carriedCostOf(unitId);
			for (const row of stagedRowsInDeliveryOrder(dt, resourceId)) {
				let claimed = 0;
				for (const other of S.units.values()) {
					if (other.unitId === unitId) continue;
					if (other.task.kind === "collecting" && other.task.deliveryId === dt.deliveryId && other.task.productId === row.productId && other.task.resourceId === row.resourceId) claimed += other.task.quantity;
				}
				const available = row.quantity - claimed;
				if (available <= 0) continue;
				const cost = productCost.get(row.productId) ?? 0;
				const fits = cost > 0 ? Math.floor((capacity - carried) / cost) : available;
				if (fits <= 0) continue;
				const qty = placeableQty(row.productId, Math.min(available, fits));
				if (qty > 0) return {
					resourceId: row.resourceId,
					productId: row.productId,
					quantity: qty
				};
			}
			return null;
		};
		const schedulePutAwayHandling = (unitId, dt, phase, quantity, locationId, now) => {
			const at = now + quantity * executionConfig.pickDurationMsPerItem;
			if (at > 2147483647) return;
			record(now, phase === "collect" ? "PUTAWAY_COLLECT_STARTED" : "PUTAWAY_PLACE_STARTED", null, unitId, `${dt.deliveryId} ${quantity} item(s)${locationId ? ` -> ${locationId}` : ""}`);
			S.kernel.schedule({
				id: `ops-putaway-${phase}-${unitId}-${dt.idx}-${now}`,
				timeMs: at,
				priority: EVENT_PRIORITY.COMPLETION,
				kind: "PUTAWAY_COMPLETED",
				data: {
					unitId,
					deliveryIdx: dt.idx,
					phase,
					locationId
				}
			});
		};
		const tryAdvancePutAway = (now) => {
			for (const unit of S.units.values()) {
				if (unit.task.kind === "yield-to-parking") continue;
				if (unit.task.kind !== "awaiting-location") continue;
				const load = S.store.snapshot().carried.find((c) => c.unitId === unit.unitId)?.loads.find((l) => l.quantity > 0);
				if (!load) {
					closePutAwayWait(unit.unitId, now);
					unit.task = { kind: "idle" };
					continue;
				}
				const snap = transportUnitById(unit.unitId);
				if (snap.state !== "idle") continue;
				const dt = S.deliveries.get(unit.task.deliveryId);
				const fitQty = placeableQty(load.productId, load.quantity);
				if (fitQty <= 0) {
					dt.waitReason = "PUTAWAY_NO_LOCATION";
					openWait(unit.unitId, null, "PUTAWAY_NO_LOCATION", `${load.productId} has no eligible storage location yet`, now);
					const home = unitParking.get(unit.unitId);
					if (home && !posesEqual(snap.pose, home)) {
						if (requestUnitMove(unit.unitId, home, now, null, "putaway-blocked-parking").status !== "rejected") {
							unit.task = {
								kind: "yield-to-parking",
								deliveryId: dt.deliveryId
							};
							closePutAwayWait(unit.unitId, now);
						}
					}
					continue;
				}
				const sel = S.store.selectPutAwayLocation(load.productId, fitQty);
				if (sel.status !== "selectable") continue;
				const dest = locationApproach.get(sel.locationId);
				closePutAwayWait(unit.unitId, now);
				dt.waitReason = null;
				if (posesEqual(snap.pose, dest)) {
					const placeQty = Math.min(load.quantity, freeAtLocation(sel.locationId, load.productId));
					if (placeQty <= 0) {
						dt.waitReason = "PUTAWAY_NO_LOCATION";
						openWait(unit.unitId, null, "PUTAWAY_NO_LOCATION", `${load.productId} has no eligible storage location yet`, now);
						continue;
					}
					unit.task = {
						kind: "storing",
						deliveryId: dt.deliveryId,
						locationId: sel.locationId
					};
					schedulePutAwayHandling(unit.unitId, dt, "place", placeQty, sel.locationId, now);
				} else {
					if (requestUnitMove(unit.unitId, dest, now, null, `putaway-store:${sel.locationId}`).status === "rejected") {
						dt.waitReason = "PUTAWAY_NO_LOCATION";
						openWait(unit.unitId, null, "PUTAWAY_NO_LOCATION", `${load.productId} has no eligible storage location yet`, now);
						continue;
					}
					unit.task = {
						kind: "to-store",
						deliveryId: dt.deliveryId,
						locationId: sel.locationId
					};
				}
			}
			for (const unit of S.units.values()) {
				if (unit.role !== "putaway" || unit.task.kind !== "idle") continue;
				const dt = [...S.deliveries.values()].filter((d) => d.created && (d.state === "RECEIVING" || d.state === "PUTAWAY_PENDING" || d.state === "PUTAWAY") && deliveryReceivingRemaining(d.deliveryId) > 0).sort((a, b) => a.arrivalTimeMs - b.arrivalTimeMs || a.idx - b.idx)[0];
				if (!dt) return;
				const chosen = choosePlaceableCollect(dt, unit.unitId);
				if (!chosen) continue;
				if (dt.state === "PUTAWAY_PENDING") {
					dt.state = "PUTAWAY";
					dt.timestamps.PUTAWAY = now;
				}
				dt.waitReason = null;
				unit.task = {
					kind: "to-receive",
					deliveryId: dt.deliveryId,
					resourceId: chosen.resourceId
				};
				const dest = S.receivingCoords.get(chosen.resourceId);
				const pose = transportUnitById(unit.unitId).pose;
				if (posesEqual(pose, dest)) {
					unit.task = {
						kind: "collecting",
						deliveryId: dt.deliveryId,
						resourceId: chosen.resourceId,
						productId: chosen.productId,
						quantity: chosen.quantity
					};
					schedulePutAwayHandling(unit.unitId, dt, "collect", chosen.quantity, null, now);
				} else if (requestUnitMove(unit.unitId, dest, now, null, `putaway-collect:${dt.deliveryId}`).status === "rejected") unit.task = { kind: "idle" };
				else unit.task = {
					kind: "to-receive",
					deliveryId: dt.deliveryId,
					resourceId: chosen.resourceId
				};
			}
		};
		const onDeliveryArrival = (event, now) => {
			const data = event.data;
			const deliveryId = typeof data?.deliveryId === "string" ? data.deliveryId : null;
			const dt = deliveryId ? S.deliveries.get(deliveryId) : void 0;
			if (!dt || dt.created) {
				record(now, "STALE_IGNORED", null, null, "unknown or duplicate delivery arrival; no mutation");
				return;
			}
			dt.created = true;
			dt.timestamps.RECEIVING = now;
			record(now, "DELIVERY_ARRIVED", null, null, `${dt.deliveryId} arrived with ${dt.lines.length} line(s)`);
			requestDispatch(now);
		};
		const onReceiveCompleted = (event, now) => {
			const data = event.data;
			const deliveryIdx = typeof data?.deliveryIdx === "number" ? data.deliveryIdx : null;
			if (deliveryIdx === null) return;
			const spec = scenario.deliverySchedule[deliveryIdx];
			const dt = spec ? S.deliveries.get(spec.id) : void 0;
			if (!dt || !dt.created || dt.state !== "RECEIVING" || dt.serviceDone) {
				record(now, "STALE_IGNORED", null, null, "unexpected receiving completion; no mutation");
				return;
			}
			dt.serviceDone = true;
			finishReceivingIfAccepted(dt, now);
		};
		const onPutAwayCompleted = (event, now) => {
			const data = event.data;
			const unitId = typeof data?.unitId === "string" ? data.unitId : null;
			const deliveryIdx = typeof data?.deliveryIdx === "number" ? data.deliveryIdx : null;
			const phase = data?.phase === "collect" || data?.phase === "place" ? data.phase : null;
			if (unitId === null || deliveryIdx === null || phase === null) return;
			const spec = scenario.deliverySchedule[deliveryIdx];
			const dt = spec ? S.deliveries.get(spec.id) : void 0;
			const unit = S.units.get(unitId);
			if (!dt || !unit) {
				record(now, "STALE_IGNORED", null, unitId, "put-away completion for unknown delivery/unit; no mutation");
				return;
			}
			if (phase === "collect") {
				if (unit.task.kind !== "collecting" || unit.task.deliveryId !== dt.deliveryId) {
					record(now, "STALE_IGNORED", null, unitId, "unexpected put-away collect; no mutation");
					return;
				}
				const collectedProduct = unit.task.productId;
				const taskedQty = unit.task.quantity;
				const collectedResource = unit.task.resourceId;
				const stagedNow = S.store.snapshot().receiving.find((r) => r.deliveryId === dt.deliveryId && r.resourceId === collectedResource && r.productId === collectedProduct)?.quantity ?? 0;
				if (stagedNow <= 0) {
					unit.task = { kind: "idle" };
					record(now, "STALE_IGNORED", null, unitId, "staged stock already collected by another unit; no mutation");
					requestDispatch(now);
					return;
				}
				const collectedQty = Math.min(taskedQty, stagedNow);
				S.store.collectPutAway({
					eventId: `inv-collect-${dt.idx}-${unitId}-${now}`,
					timeMs: now,
					deliveryId: dt.deliveryId,
					resourceId: collectedResource,
					unitId,
					productId: collectedProduct,
					quantity: collectedQty
				});
				record(now, "PUTAWAY_COLLECTED", null, unitId, `${dt.deliveryId} ${collectedProduct}x${collectedQty} collected`);
				finishReceivingIfAccepted(dt, now);
				const fitQty = placeableQty(collectedProduct, collectedQty);
				if (fitQty <= 0) {
					unit.task = {
						kind: "awaiting-location",
						deliveryId: dt.deliveryId
					};
					dt.waitReason = "PUTAWAY_NO_LOCATION";
					openWait(unitId, null, "PUTAWAY_NO_LOCATION", `${collectedProduct} has no eligible storage location yet`, now);
					requestDispatch(now);
					return;
				}
				const sel = S.store.selectPutAwayLocation(collectedProduct, fitQty);
				if (sel.status !== "selectable") {
					unit.task = {
						kind: "awaiting-location",
						deliveryId: dt.deliveryId
					};
					dt.waitReason = "PUTAWAY_NO_LOCATION";
					openWait(unitId, null, "PUTAWAY_NO_LOCATION", `${collectedProduct} has no eligible storage location yet`, now);
					requestDispatch(now);
					return;
				}
				closePutAwayWait(unitId, now);
				dt.waitReason = null;
				const dest = locationApproach.get(sel.locationId);
				const pose = transportUnitById(unitId).pose;
				if (posesEqual(pose, dest)) {
					const placeQty = Math.min(collectedQty, freeAtLocation(sel.locationId, collectedProduct));
					if (placeQty <= 0) {
						unit.task = {
							kind: "awaiting-location",
							deliveryId: dt.deliveryId
						};
						dt.waitReason = "PUTAWAY_NO_LOCATION";
						openWait(unitId, null, "PUTAWAY_NO_LOCATION", `${collectedProduct} has no eligible storage location yet`, now);
						requestDispatch(now);
						return;
					}
					unit.task = {
						kind: "storing",
						deliveryId: dt.deliveryId,
						locationId: sel.locationId
					};
					schedulePutAwayHandling(unitId, dt, "place", placeQty, sel.locationId, now);
				} else {
					if (requestUnitMove(unitId, dest, now, null, `putaway-store:${sel.locationId}`).status === "rejected") {
						unit.task = {
							kind: "awaiting-location",
							deliveryId: dt.deliveryId
						};
						dt.waitReason = "PUTAWAY_NO_LOCATION";
						openWait(unitId, null, "PUTAWAY_NO_LOCATION", `${collectedProduct} has no eligible storage location yet`, now);
						requestDispatch(now);
						return;
					}
					unit.task = {
						kind: "to-store",
						deliveryId: dt.deliveryId,
						locationId: sel.locationId
					};
				}
				return;
			}
			const locationId = typeof data?.locationId === "string" ? data.locationId : null;
			if (unit.task.kind !== "storing" || unit.task.deliveryId !== dt.deliveryId || locationId === null) {
				record(now, "STALE_IGNORED", null, unitId, "unexpected put-away place; no mutation");
				return;
			}
			const carriedRow = S.store.snapshot().carried.find((c) => c.unitId === unitId);
			if (!carriedRow || carriedRow.loads.every((l) => l.quantity <= 0)) {
				closePutAwayWait(unitId, now);
				unit.task = { kind: "idle" };
				requestDispatch(now);
				return;
			}
			let remainder = false;
			for (const load of carriedRow.loads) {
				if (load.quantity <= 0) continue;
				const placeQty = Math.min(load.quantity, Math.max(0, freeAtLocation(locationId, load.productId)));
				if (placeQty > 0) {
					S.store.placePutAway({
						eventId: `inv-place-${dt.idx}-${unitId}-${load.productId}-${locationId}-${now}`,
						timeMs: now,
						deliveryId: dt.deliveryId,
						unitId,
						locationId,
						productId: load.productId,
						quantity: placeQty
					});
					record(now, "PUTAWAY_STORED", null, unitId, `${dt.deliveryId} ${load.productId}x${placeQty} stored at ${locationId}`);
				}
				if (placeQty < load.quantity) remainder = true;
			}
			if (remainder) {
				unit.task = {
					kind: "awaiting-location",
					deliveryId: dt.deliveryId
				};
				dt.waitReason = "PUTAWAY_NO_LOCATION";
				openWait(unitId, null, "PUTAWAY_NO_LOCATION", `remaining put-away load has no eligible storage location yet`, now);
				requestDispatch(now);
				return;
			}
			closePutAwayWait(unitId, now);
			dt.waitReason = null;
			unit.task = { kind: "idle" };
			if (deliveryExternalRemaining(dt.deliveryId) === 0 && deliveryReceivingRemaining(dt.deliveryId) === 0 && ![...S.units.values()].some((u) => (S.store.snapshot().carried.find((c) => c.unitId === u.unitId)?.loads ?? []).some((l) => l.quantity > 0) && u.task.kind !== "idle")) {
				dt.state = "STORED";
				dt.timestamps.STORED = now;
				dt.waitReason = null;
				record(now, "DELIVERY_STORED", null, null, `${dt.deliveryId} fully stored`);
			}
			requestDispatch(now);
		};
		const onMovementCompleted = (unitId, now) => {
			const unit = S.units.get(unitId);
			if (!unit) return;
			const snap = transportUnitById(unitId);
			if (snap.state === "moving") return;
			const t = unit.task;
			if (t.kind === "to-receive") {
				const dt = S.deliveries.get(t.deliveryId);
				const dest = S.receivingCoords.get(t.resourceId);
				if (!dt || !dest || !posesEqual(snap.pose, dest)) return;
				const chosen = choosePlaceableCollect(dt, unitId, t.resourceId);
				if (!chosen) {
					const home = unitParking.get(unitId);
					if (posesEqual(snap.pose, home)) unit.task = { kind: "idle" };
					else {
						unit.task = { kind: "to-parking" };
						const mv = requestUnitMove(unitId, home, now, null, "parking-return");
						if (mv.status !== "granted" && mv.status !== "waiting") unit.task = { kind: "idle" };
					}
				} else {
					unit.task = {
						kind: "collecting",
						deliveryId: dt.deliveryId,
						resourceId: t.resourceId,
						productId: chosen.productId,
						quantity: chosen.quantity
					};
					record(now, "PUTAWAY_AT_RECEIVING", null, unitId, `at ${t.resourceId} for ${dt.deliveryId}`);
					schedulePutAwayHandling(unitId, dt, "collect", chosen.quantity, null, now);
				}
			} else if (t.kind === "yield-to-parking") {
				const dt = S.deliveries.get(t.deliveryId);
				const home = unitParking.get(unitId);
				if (!dt || !posesEqual(snap.pose, home)) return;
				unit.task = {
					kind: "awaiting-location",
					deliveryId: dt.deliveryId
				};
				record(now, "PUTAWAY_YIELD_PARKED", null, unitId, `parked with load for ${dt.deliveryId}; selection retries`);
			} else if (t.kind === "to-store") {
				const dt = S.deliveries.get(t.deliveryId);
				const dest = locationApproach.get(t.locationId);
				if (!dt || !dest || !posesEqual(snap.pose, dest)) return;
				const firstLoad = S.store.snapshot().carried.find((c) => c.unitId === unitId)?.loads.find((l) => l.quantity > 0);
				if (!firstLoad) {
					closePutAwayWait(unitId, now);
					unit.task = { kind: "idle" };
				} else {
					const freeHere = freeAtLocation(t.locationId, firstLoad.productId);
					if (freeHere <= 0) {
						unit.task = {
							kind: "awaiting-location",
							deliveryId: dt.deliveryId
						};
						dt.waitReason = "PUTAWAY_NO_LOCATION";
						openWait(unitId, null, "PUTAWAY_NO_LOCATION", `${firstLoad.productId} has no eligible storage location yet`, now);
					} else {
						unit.task = {
							kind: "storing",
							deliveryId: dt.deliveryId,
							locationId: t.locationId
						};
						record(now, "PUTAWAY_AT_LOCATION", null, unitId, `at ${t.locationId} for ${dt.deliveryId}`);
						schedulePutAwayHandling(unitId, dt, "place", Math.min(firstLoad.quantity, freeHere), t.locationId, now);
					}
				}
			} else if (t.kind === "to-pick") {
				const rt = S.orders.get(t.orderId);
				const leg = rt?.legs[t.legIndex];
				if (!rt || rt.unitId !== unitId || !leg || !posesEqual(snap.pose, leg.approach)) return;
				unit.task = {
					kind: "picking",
					orderId: rt.orderId,
					legIndex: t.legIndex
				};
				record(now, "LEG_ARRIVED", rt.orderId, unitId, `at ${leg.locationId} approach`);
				schedulePickCompletion(unitId, rt, t.legIndex, now);
			} else if (t.kind === "to-queue") {
				const rt = S.orders.get(t.orderId);
				const res = S.resources.get(t.resourceId);
				const slot = res?.queueCoords.get(t.slotId);
				if (!rt || !res || !slot || !posesEqual(snap.pose, slot)) return;
				unit.task = {
					kind: "in-queue",
					orderId: rt.orderId,
					resourceId: t.resourceId,
					slotId: t.slotId
				};
				record(now, "QUEUE_ARRIVED", rt.orderId, unitId, `arrived ${t.slotId} holding ${rt.totalItems} item(s)`);
				attemptServiceApproach(rt.orderId, t.resourceId, now);
			} else if (t.kind === "to-service") {
				const rt = S.orders.get(t.orderId);
				const res = S.resources.get(t.resourceId);
				if (!rt || !res) return;
				if (!posesEqual(snap.pose, firstServicePosition(res))) return;
				unit.task = {
					kind: "unloading",
					orderId: rt.orderId,
					resourceId: t.resourceId
				};
				record(now, "SERVICE_ARRIVED", rt.orderId, unitId, `at ${t.resourceId} service position`);
				scheduleUnloadCompletion(unitId, rt, t.resourceId, now);
			} else if (t.kind === "to-vacate") {
				const slot = S.resources.get(t.resourceId)?.queueCoords.get(t.slotId);
				if (!slot || !posesEqual(snap.pose, slot)) return;
				unit.task = { kind: "idle" };
				record(now, "VACATED", null, unitId, `idle at ${t.resourceId} slot ${t.slotId}; parking next`);
			} else if (t.kind === "to-parking") {
				const home = unitParking.get(unitId);
				if (!posesEqual(snap.pose, home)) return;
				unit.task = { kind: "idle" };
				record(now, "PARKED", null, unitId, "idle at parking");
			} else return;
			noteConcurrency(now);
			requestDispatch(now);
		};
		const onHandlingCompleted = (event, now) => {
			const data = event.data;
			const unitId = typeof data?.unitId === "string" ? data.unitId : null;
			const orderIdx = typeof data?.orderIdx === "number" ? data.orderIdx : null;
			const handling = data?.handling === "pick" || data?.handling === "unload" ? data.handling : null;
			if (unitId === null || orderIdx === null || handling === null) return;
			const spec = scenario.orderSchedule[orderIdx];
			const rt = spec ? S.orders.get(spec.id) : void 0;
			const unit = S.units.get(unitId);
			if (!rt || !rt.created || !unit) {
				record(now, "STALE_IGNORED", null, unitId, "handling for unknown order/unit; no mutation");
				return;
			}
			if (handling === "pick") {
				const legIndex = typeof data?.legIndex === "number" ? data.legIndex : -1;
				const leg = rt.legs[legIndex];
				const pose = transportUnitById(unitId).pose;
				if (unit.task.kind !== "picking" || unit.task.orderId !== rt.orderId || unit.task.legIndex !== legIndex || !leg || leg.committed || rt.state !== "PICKING" && rt.state !== "WAITING_FOR_PACKING" || rt.unitId !== unitId || !posesEqual(pose, leg.approach)) {
					record(now, "STALE_IGNORED", rt.orderId, unitId, "unexpected pick completion; no mutation");
					return;
				}
				S.store.pick({
					eventId: `inv-pick-${rt.idx}-${legIndex}`,
					timeMs: now,
					orderId: rt.orderId,
					unitId,
					locationId: leg.locationId,
					productId: leg.productId,
					quantity: leg.quantity
				});
				leg.committed = true;
				rt.legsDone += 1;
				record(now, "PICK_COMMITTED", rt.orderId, unitId, `${leg.productId}x${leg.quantity} from ${leg.locationId}`);
				const nextIndex = legIndex + 1;
				if (nextIndex < rt.legs.length) {
					const nextLeg = rt.legs[nextIndex];
					const nextCost = (productCost.get(nextLeg.productId) ?? 0) * nextLeg.quantity;
					const carriedNow = carriedCostOf(unitId);
					const capNow = unitCapacity.get(unitId) ?? 0;
					if (carriedNow > 0 && carriedNow + nextCost > capNow) {
						deliverToPacking(unitId, rt, now);
						return;
					}
				}
				if (nextIndex < rt.legs.length) {
					const next = rt.legs[nextIndex];
					unit.task = {
						kind: "to-pick",
						orderId: rt.orderId,
						legIndex: nextIndex
					};
					if (posesEqual(pose, next.approach)) {
						unit.task = {
							kind: "picking",
							orderId: rt.orderId,
							legIndex: nextIndex
						};
						schedulePickCompletion(unitId, rt, nextIndex, now);
						return;
					}
					const mv = requestUnitMove(unitId, next.approach, now, rt.orderId, `pick-leg-${nextIndex}:${next.locationId}`);
					if (mv.status === "rejected") diagnose(rt, "UNREACHABLE_APPROACH", `static route to ${next.locationId} approach rejected (${mv.reason}); partial load retained, no further pick continues`, true, now);
					return;
				}
				deliverToPacking(unitId, rt, now);
				return;
			}
			const resourceId = typeof data?.resourceId === "string" ? data.resourceId : null;
			const res = resourceId ? S.resources.get(resourceId) : void 0;
			const pose = transportUnitById(unitId).pose;
			if (!rt || !res || unit.task.kind !== "unloading" || unit.task.orderId !== rt.orderId || rt.unloadCommitted || rt.state !== "WAITING_FOR_PACKING" || !posesEqual(pose, firstServicePosition(res))) {
				record(now, "STALE_IGNORED", rt?.orderId ?? null, unitId, "unexpected unload completion; no mutation");
				return;
			}
			tryUnloadCommit(unitId, rt, resourceId, now);
		};
		const onPackCompleted = (event, now) => {
			const data = event.data;
			const orderIdx = typeof data?.orderIdx === "number" ? data.orderIdx : null;
			if (orderIdx === null) return;
			const spec = scenario.orderSchedule[orderIdx];
			const rt = spec ? S.orders.get(spec.id) : void 0;
			if (!rt || !rt.created) {
				record(now, "STALE_IGNORED", null, null, "pack completion for unknown order; no mutation");
				return;
			}
			if (rt.state !== "PACKING" || rt.packed) {
				record(now, "STALE_IGNORED", rt.orderId, null, "unexpected pack completion; no mutation");
				return;
			}
			tryPackCommit(rt, now);
		};
		const onArrival = (event, now) => {
			const data = event.data;
			const orderId = typeof data?.orderId === "string" ? data.orderId : null;
			const rt = orderId ? S.orders.get(orderId) : void 0;
			if (!rt || rt.created) {
				record(now, "STALE_IGNORED", orderId, null, "unknown or duplicate arrival; no mutation");
				return;
			}
			rt.created = true;
			transition(rt, "CREATED", now, null, `arrived with ${rt.lines.length} line(s)`);
			requestDispatch(now);
		};
		const onEvent = (event, api) => {
			const now = event.timeMs;
			if (event.kind === "MOVEMENT_COMPLETED") {
				S.domain.handleMovementCompleted(event, api);
				const data = event.data;
				if (typeof data?.unitId === "string") onMovementCompleted(data.unitId, now);
				return;
			}
			switch (event.kind) {
				case "ORDER_ARRIVAL":
					onArrival(event, now);
					break;
				case "OPERATIONS_DISPATCH":
					S.dispatchPending = false;
					runDispatch(now);
					break;
				case "HANDLING_COMPLETED":
					onHandlingCompleted(event, now);
					break;
				case "PACK_COMPLETED":
					onPackCompleted(event, now);
					break;
				case "DISPATCH_COMPLETED":
					onDispatchCompleted(event, now);
					break;
				case "DELIVERY_ARRIVAL":
					onDeliveryArrival(event, now);
					break;
				case "RECEIVE_COMPLETED":
					onReceiveCompleted(event, now);
					break;
				case "PUTAWAY_COMPLETED": onPutAwayCompleted(event, now);
			}
		};
		const kernel = createKernel({
			maxProcessedEvents: scenario.policies.eventLimits.maxProcessedEvents,
			maxEventsPerTimestamp: scenario.policies.eventLimits.maxEventsPerTimestamp,
			onEvent: (event, api) => {
				onEvent(event, api);
			}
		});
		S.kernel = kernel;
		S.domain.bindKernel(kernel);
		let arrivalSeq = 0;
		for (const rt of S.orders.values()) {
			arrivalSeq += 1;
			kernel.schedule({
				id: `ops-arrival-${arrivalSeq}`,
				timeMs: rt.arrivalTimeMs,
				priority: EVENT_PRIORITY.ARRIVAL,
				kind: "ORDER_ARRIVAL",
				data: { orderId: rt.orderId }
			});
		}
		let deliverySeq = 0;
		for (const dt of S.deliveries.values()) {
			deliverySeq += 1;
			kernel.schedule({
				id: `ops-delivery-${deliverySeq}`,
				timeMs: dt.arrivalTimeMs,
				priority: EVENT_PRIORITY.ARRIVAL,
				kind: "DELIVERY_ARRIVAL",
				data: { deliveryId: dt.deliveryId }
			});
		}
		return S;
	};
	const freezeValue = (value) => {
		if (Array.isArray(value)) {
			for (const item of value) freezeValue(item);
			return Object.freeze(value);
		}
		if (typeof value === "object" && value !== null) {
			for (const key of Object.keys(value)) freezeValue(value[key]);
			return Object.freeze(value);
		}
		return value;
	};
	const describeBlocker = (waiting) => {
		const b = waiting.blocker;
		if (b.kind === "unit") return `TRAFFIC:unit:${b.blockerUnitId}:${b.reason}`;
		if (b.kind === "zone") return `TRAFFIC:zone:${b.zoneId}:${b.holderUnitId}:${b.reason}`;
		return `TRAFFIC:unknown:${b.reason}`;
	};
	const orderWaitReason = (S, rt, transport) => {
		if (!rt.created || rt.diagnostic?.terminal) return null;
		if (rt.state === "READY_FOR_DISPATCH") return rt.waitReason;
		if (rt.state === "SHIPPED") return null;
		if (rt.state === "CREATED") return "DISPATCH_PENDING";
		if (rt.state === "WAITING_FOR_STOCK") return "WAITING_FOR_STOCK";
		if (rt.state === "READY_FOR_PICKING") return rt.unitId === null ? "NO_IDLE_PICKER" : null;
		if (rt.state === "PICKING") {
			if (!rt.unitId) return rt.waitReason;
			const tu = transport.units.find((u) => u.unitId === rt.unitId);
			if (tu?.state === "waiting" && tu.waiting) return describeBlocker(tu.waiting);
			return null;
		}
		if (rt.state === "WAITING_FOR_PACKING") {
			if (!rt.unitId || !rt.packingResourceId) return rt.waitReason;
			const tu = transport.units.find((u) => u.unitId === rt.unitId);
			if (tu?.state === "waiting" && tu.waiting) return describeBlocker(tu.waiting);
			const unit = S.units.get(rt.unitId);
			const res = S.resources.get(rt.packingResourceId);
			if (!unit || !res) return rt.waitReason;
			if (unit.task.kind === "awaiting-queue-slot") return "QUEUE_FULL";
			if (unit.task.kind === "awaiting-head") return rt.waitReason ?? "AWAITING_HEAD";
			if (unit.task.kind === "awaiting-staging") return "PACKING_STAGING_FULL";
			if (unit.task.kind === "awaiting-service-start") return rt.waitReason ?? "SERVICE_WAIT";
			if (unit.task.kind === "in-queue") {
				const jobs = res.station.snapshot().jobs;
				if ((jobs.filter((j) => j.state === "queued").sort((a, b) => a.enqueueTimeMs - b.enqueueTimeMs || (a.jobId < b.jobId ? -1 : 1))[0]?.jobId ?? null) !== rt.jobId) return "QUEUED_BEHIND_HEAD";
				if (jobs.some((j) => j.state === "in-service" || j.state === "output-held")) return "BUSY_STATION";
				if (res.approachingJobId !== null && res.approachingJobId !== rt.jobId) return "APPROACH_RESERVED";
				return null;
			}
			return null;
		}
		if (rt.packed || !rt.packingResourceId) return null;
		if ((S.resources.get(rt.packingResourceId)?.station.snapshot().jobs.find((j) => j.jobId === rt.jobId))?.state === "output-held") return "OUTPUT_BLOCKED";
		return null;
	};
	const checkCapacity = (S) => {
		const violations = [];
		const inv = S.store.snapshot();
		for (const row of inv.carried) {
			let used = 0;
			for (const load of row.loads) used += (productCost.get(load.productId) ?? 0) * load.quantity;
			const cap = unitCapacity.get(row.unitId) ?? 0;
			if (used > cap) violations.push(`unit ${row.unitId} carries ${used}/${cap} handling-cost units`);
		}
		for (const [resourceId, res] of S.resources) {
			const cfg = packingConfigById.get(resourceId);
			if (!cfg) continue;
			let staged = 0;
			for (const row of inv.packing) {
				if (row.resourceId !== resourceId) continue;
				staged += (productCost.get(row.productId) ?? 0) * row.quantity;
			}
			if (staged > cfg.inputStagingCapacity) violations.push(`packing ${resourceId} stages ${staged}/${cfg.inputStagingCapacity} input cost units`);
			if (res.outputUsed > cfg.outputStagingCapacity) violations.push(`packing ${resourceId} holds ${res.outputUsed}/${cfg.outputStagingCapacity} output cost units`);
			const jobs = res.station.snapshot().jobs;
			const queued = jobs.filter((j) => j.state === "queued" && j.queueSlotId !== null).length;
			if (queued > cfg.queueSlots.length) violations.push(`packing ${resourceId} queues ${queued}/${cfg.queueSlots.length} jobs`);
			const busy = jobs.filter((j) => j.state === "in-service" || j.state === "output-held").length;
			if (busy > cfg.servicePositions.length || busy > cfg.serviceCapacity) violations.push(`packing ${resourceId} runs ${busy} job(s) on ${cfg.servicePositions.length} position(s)`);
		}
		return violations;
	};
	const checkSafety = (S) => {
		const violations = [];
		const discs = S.domain.snapshot().units.map((u) => ({
			unitId: u.unitId,
			pose: u.pose,
			radius: unitRadius.get(u.unitId) ?? 0
		}));
		for (let i = 0; i < discs.length; i += 1) for (let j = i + 1; j < discs.length; j += 1) {
			const a = discs[i];
			const b = discs[j];
			if (stationaryVsStationaryConflict(a.pose, a.radius, b.pose, b.radius)) violations.push(`overlap at snapshot: ${a.unitId} vs ${b.unitId}`);
		}
		const kept = S.trajectories;
		for (let i = 0; i < kept.length; i += 1) for (let j = i + 1; j < kept.length; j += 1) {
			const a = kept[i];
			const b = kept[j];
			if (a.unitId === b.unitId) continue;
			if (!(Math.max(a.trajectory.startMs, b.trajectory.startMs) <= Math.min(a.trajectory.endMs, b.trajectory.endMs))) continue;
			if (trajectoriesConflict(a.trajectory, b.trajectory).conflict) violations.push(`swept conflict: ${a.unitId} (${a.purpose} ${a.trajectory.startMs}..${a.trajectory.endMs}) vs ${b.unitId} (${b.purpose} ${b.trajectory.startMs}..${b.trajectory.endMs})`);
		}
		return violations;
	};
	const buildSnapshot = (S) => {
		const transport = S.domain.snapshot();
		const inv = S.store.snapshot();
		const reservationOf = (orderId) => {
			const entry = inv.reservations.find((r) => r.orderId === orderId);
			if (!entry) return [];
			const out = [];
			for (const line of entry.lines) for (const src of line.sources) out.push({
				productId: line.productId,
				locationId: src.locationId,
				quantity: src.remaining
			});
			return out;
		};
		const deliveries = scenario.deliverySchedule.map((spec) => {
			const dt = S.deliveries.get(spec.id);
			return {
				deliveryId: dt.deliveryId,
				arrivalTimeMs: dt.arrivalTimeMs,
				state: dt.created ? dt.state : "NOT_ARRIVED",
				timestamps: { ...dt.timestamps },
				lines: dt.lines.map((l) => ({ ...l })),
				receivingResourceId: dt.receivingResourceId,
				waitReason: dt.waitReason
			};
		});
		const orders = fifoSelected.map(({ spec }) => {
			const rt = S.orders.get(spec.id);
			return {
				orderId: rt.orderId,
				arrivalTimeMs: rt.arrivalTimeMs,
				state: rt.created ? rt.state : "NOT_ARRIVED",
				timestamps: { ...rt.timestamps },
				lines: rt.lines.map((l) => ({ ...l })),
				reservation: reservationOf(rt.orderId),
				unitId: rt.unitId,
				packingResourceId: rt.packingResourceId,
				dispatchResourceId: rt.dispatchResourceId,
				queueSlotId: rt.queueSlotId,
				waitReason: orderWaitReason(S, rt, transport),
				diagnostic: rt.diagnostic ? { ...rt.diagnostic } : null
			};
		});
		const units = [...S.units.values()].sort((a, b) => a.unitId < b.unitId ? -1 : 1).map((unit) => {
			const tu = transport.units.find((u) => u.unitId === unit.unitId);
			const carried = inv.carried.find((c) => c.unitId === unit.unitId)?.loads.map((l) => ({ ...l })) ?? [];
			const carriedCostUnits = carried.reduce((n, l) => n + (productCost.get(l.productId) ?? 0) * l.quantity, 0);
			let waitReason = null;
			if (tu.state === "waiting" && tu.waiting) waitReason = describeBlocker(tu.waiting);
			else if ("orderId" in unit.task) {
				const rt = S.orders.get(unit.task.orderId);
				if (rt) waitReason = orderWaitReason(S, rt, transport);
			}
			const task = unit.task;
			return {
				unitId: unit.unitId,
				role: unit.role,
				pose: { ...tu.pose },
				transportState: tu.state,
				task: JSON.parse(JSON.stringify(task)),
				waitReason,
				carried,
				carriedCostUnits,
				loadCapacityUnits: unitCapacity.get(unit.unitId) ?? 0,
				authorizedRoute: tu.plan ? JSON.parse(JSON.stringify(tu.plan)) : null
			};
		});
		const packing = [...S.resources.values()].map((res) => {
			const cfg = packingConfigById.get(res.resourceId);
			return {
				resourceId: res.resourceId,
				serviceCapacity: cfg?.serviceCapacity ?? 0,
				serviceDurationMs: cfg?.serviceDurationMs ?? 0,
				inputStagingCapacity: cfg?.inputStagingCapacity ?? 0,
				outputStagingCapacity: cfg?.outputStagingCapacity ?? 0,
				approachingJobId: res.approachingJobId,
				jobs: res.station.snapshot().jobs.map((j) => ({ ...j })),
				packedOutput: [...res.packedOutput.entries()].map(([orderId, costUnits]) => ({
					orderId,
					costUnits
				})).sort((a, b) => a.orderId < b.orderId ? -1 : 1),
				outputUsedUnits: res.outputUsed
			};
		});
		const arrived = orders.filter((o) => o.state !== "NOT_ARRIVED").length;
		const packedCount = [...S.orders.values()].filter((o) => o.packed).length;
		const ready = orders.filter((o) => o.state === "READY_FOR_DISPATCH").length;
		const shippedCount = orders.filter((o) => o.state === "SHIPPED").length;
		return freezeValue({
			scenarioId: scenario.id,
			seed: scenario.seed,
			versions: {
				simulation: SIMULATION_VERSION,
				operationsSchema: OPERATIONS_SCHEMA_VERSION,
				operationsEngine: OPERATIONS_ENGINE_VERSION
			},
			executionConfig: { ...executionConfig },
			clockMs: S.kernel.getClockMs(),
			runMode,
			deliveries,
			orders,
			excludedOrderIds: [...excludedOrderIds],
			units,
			inventory: inv,
			packing,
			timeline: S.timeline.map((t) => ({ ...t })),
			waits: S.waits.map((w) => ({ ...w })),
			motionHistory: S.trajectories.map((t) => ({
				unitId: t.unitId,
				planVersion: t.planVersion,
				orderId: t.orderId,
				purpose: t.purpose,
				startMs: t.trajectory.startMs,
				endMs: t.trajectory.endMs,
				segmentCount: t.trajectory.segments.length
			})),
			maxConcurrentMoving: { ...S.maxConcurrentMoving },
			counts: {
				selected: orders.length,
				excluded: excludedOrderIds.length,
				arrived,
				packed: packedCount,
				readyForDispatch: ready,
				shipped: shippedCount,
				backlog: arrived - shippedCount,
				stageBacklog: arrived - ready - shippedCount
			},
			checks: {
				conservation: S.store.checkInvariants(),
				capacity: checkCapacity(S),
				safety: checkSafety(S)
			}
		});
	};
	const completionOf = (S) => {
		const all = [...S.orders.values()];
		const ready = all.filter((o) => o.state === "READY_FOR_DISPATCH").length;
		const created = all.filter((o) => o.created).length;
		const reasons = all.filter((o) => o.diagnostic?.terminal).map((o) => ({
			orderId: o.orderId,
			code: o.diagnostic.code,
			message: o.diagnostic.message
		}));
		const shipped = all.filter((o) => o.state === "SHIPPED").length;
		const done = ready + shipped;
		if (runMode === "finite-cohort") {
			const hasDispatch = S.dispatchStations.size > 0;
			const deliveriesStored = S.deliveries.size === 0 || [...S.deliveries.values()].every((d) => d.created && d.state === "STORED");
			if (all.length > 0 && deliveriesStored && (hasDispatch ? shipped === all.length : done === all.length)) return {
				stage: "SUPPORTED_STAGE_COMPLETE",
				ready,
				selected: all.length,
				shipped,
				backlog: all.length - shipped,
				stageBacklog: 0,
				note: shipped === all.length ? "all selected orders SHIPPED through the configured dispatch lane(s)" : "all selected orders READY_FOR_DISPATCH; no dispatch resource configured, nothing SHIPPED"
			};
			if (reasons.length > 0 && created === all.length && done + reasons.length === all.length) return {
				stage: "BLOCKED",
				ready,
				selected: all.length,
				created,
				backlog: created - shipped,
				stageBacklog: created - done,
				shipped,
				detail: "every selected order is ready/shipped or terminally blocked; state retained, no partial fulfillment",
				reasons
			};
			const stuck = diagnosticOf(S);
			if (stuck && stuck.status === "stuck" && created === all.length) {
				const stuckReasons = [...reasons];
				for (const w of stuck.operationsWaits) stuckReasons.push({
					orderId: w.orderId,
					code: `STUCK_${w.reason}`,
					message: stuck.detail
				});
				if (stuckReasons.length === reasons.length) {
					for (const o of all) if (o.state !== "READY_FOR_DISPATCH") stuckReasons.push({
						orderId: o.orderId,
						code: "TRANSPORT_STUCK",
						message: stuck.detail
					});
				}
				return {
					stage: "BLOCKED",
					ready,
					selected: all.length,
					created,
					backlog: created - shipped,
					stageBacklog: created - done,
					shipped,
					detail: `stuck with no scheduled release: ${stuck.detail}; ${created}/${all.length} arrived, ${ready} ready for dispatch, ${created - shipped} unshipped backlog, ${created - done} stage backlog; orders/state preserved, no teleport or task deletion`,
					reasons: stuckReasons
				};
			}
			return {
				stage: "IN_PROGRESS",
				ready,
				selected: all.length,
				created,
				backlog: created - shipped,
				stageBacklog: created - done,
				shipped,
				detail: `${created}/${all.length} arrived, ${ready} ready for dispatch, ${created - shipped} unshipped backlog, ${created - done} stage backlog`,
				reasons
			};
		}
		const horizon = scenario.policies.run.mode === "fixed-window" ? scenario.policies.run.horizonMs : 0;
		if (S.kernel.getClockMs() >= horizon) return {
			stage: "WINDOW_ENDED",
			ready,
			selected: all.length,
			created,
			backlog: created - shipped,
			stageBacklog: created - done,
			shipped,
			detail: `fixed window ended at ${horizon}ms with active/pending work and partial motion retained; this is not shipping completion`,
			reasons
		};
		return {
			stage: "IN_PROGRESS",
			ready,
			selected: all.length,
			created,
			backlog: created - shipped,
			stageBacklog: created - done,
			shipped,
			detail: `${created}/${all.length} arrived, ${ready} ready for dispatch, ${created - shipped} unshipped backlog, ${created - done} stage backlog`,
			reasons
		};
	};
	const diagnosticOf = (S) => {
		const snap = S.kernel.snapshot();
		if (snap.status === "invalid") return {
			status: "kernel-invalid",
			detail: snap.diagnostic ?? "kernel invalid"
		};
		if ([...S.orders.values()].every((o) => o.state === "READY_FOR_DISPATCH" || o.state === "SHIPPED")) return null;
		const t = S.domain.getDiagnostic();
		if (!t || t.status !== "stuck") return null;
		const pendingKinds = new Set(snap.pending.map((e) => e.kind));
		if ([
			"MOVEMENT_COMPLETED",
			"HANDLING_COMPLETED",
			"PACK_COMPLETED",
			"DISPATCH_COMPLETED",
			"ORDER_ARRIVAL",
			"OPERATIONS_DISPATCH"
		].some((k) => pendingKinds.has(k))) return null;
		const operationsWaits = S.waits.filter((w) => w.endMs === null && w.orderId !== null).map((w) => ({
			orderId: w.orderId,
			reason: w.reason
		}));
		return {
			status: "stuck",
			detail: `transport reports ${t.kind} with no moving units and no future release scheduled; operations waits retained (${operationsWaits.length}); no teleport or task deletion`,
			transportWaits: t.waits,
			operationsWaits
		};
	};
	let S = initState();
	const cappedAdvanceTo = (targetMs) => {
		if (!Number.isSafeInteger(targetMs) || targetMs < 0 || targetMs > 2147483647) throw new Error(`advanceTo target must be an integer in 0..${MAX_TIME_MS}`);
		if (horizonMs === null) return S.kernel.advanceTo(targetMs);
		return S.kernel.advanceTo(Math.min(targetMs, horizonMs));
	};
	const cappedStepEvent = () => {
		if (horizonMs === null) return S.kernel.stepEvent();
		if (S.kernel.getStatus() === "invalid") return S.kernel.stepEvent();
		const next = S.kernel.snapshot().pending[0];
		if (next && next.timeMs <= horizonMs) return S.kernel.stepEvent();
		if (S.kernel.getClockMs() >= horizonMs) return {
			status: S.kernel.getStatus(),
			clockMs: S.kernel.getClockMs(),
			processedTotal: S.kernel.getProcessedTotal(),
			eventId: null,
			diagnostic: null
		};
		return S.kernel.advanceTo(horizonMs);
	};
	return {
		getClockMs: () => S.kernel.getClockMs(),
		stepEvent: () => cappedStepEvent(),
		advanceTo: (targetMs) => cappedAdvanceTo(targetMs),
		reset: () => {
			S = initState();
		},
		snapshot: () => buildSnapshot(S),
		getCompletionStatus: () => completionOf(S),
		getDiagnostic: () => diagnosticOf(S),
		exportReport: () => {
			const snap = buildSnapshot(S);
			const stage = completionOf(S).stage;
			const metrics = operationsRunMetrics(snap, stage);
			const run = scenario.policies.run;
			return {
				schema: "layoutlab.operations-report/1",
				scenarioId: snap.scenarioId,
				seed: snap.seed,
				versions: { ...snap.versions },
				scenario: structuredClone(scenario),
				executionConfig: { ...executionConfig },
				completionStage: stage,
				counts: { ...snap.counts },
				orders: snap.orders.map((o) => ({
					orderId: o.orderId,
					state: o.state,
					timestamps: { ...o.timestamps }
				})),
				deliveries: snap.deliveries.map((d) => ({
					deliveryId: d.deliveryId,
					state: d.state,
					timestamps: { ...d.timestamps }
				})),
				checks: {
					conservation: [...snap.checks.conservation],
					capacity: [...snap.checks.capacity],
					safety: [...snap.checks.safety]
				},
				clockMs: snap.clockMs,
				termination: {
					mode: run.mode,
					horizonMs: run.mode === "fixed-window" ? run.horizonMs : null,
					arrivalCutoffMs: run.mode === "finite-cohort" ? run.arrivalCutoffMs : null,
					safetyCeilingMs: null,
					stopClockMs: snap.clockMs,
					stopReason: stage === "SUPPORTED_STAGE_COMPLETE" ? "stage-complete" : stage === "BLOCKED" ? "blocked" : stage === "WINDOW_ENDED" ? "window-ended" : "caller-stopped"
				},
				totalWaitMs: metrics.totalWaitMs,
				makespanMs: metrics.makespanMs,
				lastShippedAtMs: metrics.lastShippedAtMs
			};
		}
	};
}
// packages/simulation/src/experiments.ts
var operationsPatchSchema = strictObject({
	extraPickers: number().int().min(0).max(2).optional(),
	extraPutaway: number().int().min(0).max(2).optional(),
	packingDurationMs: number().int().min(1e3).max(3e5).optional(),
	dispatchDurationMs: number().int().min(1e3).max(3e5).optional(),
	receivingDurationMs: number().int().min(1e3).max(3e5).optional()
});
function parseOperationsPatch(value) {
	return operationsPatchSchema.parse(value);
}
function applyOperationsPatch(scenario, patch) {
	const valid = parseOperationsPatch(patch);
	const next = structuredClone(scenario);
	const cloneUnit = (role, n) => {
		const template = next.mobileUnits.find((u) => u.role === role);
		if (!template) throw new Error(`patch adds ${role} units but the scenario has no ${role} template`);
		for (let i = 1; i <= n; i++) {
			const id = `${template.id}-X${i}`;
			if (next.mobileUnits.some((u) => u.id === id)) continue;
			const offset = (template.footprintMm.width + template.footprintMm.margin * 2) * i;
			next.mobileUnits.push({
				...structuredClone(template),
				id,
				parkingSlotMm: {
					x: template.parkingSlotMm.x + offset,
					z: template.parkingSlotMm.z
				}
			});
		}
	};
	if (valid.extraPickers) cloneUnit("picker", valid.extraPickers);
	if (valid.extraPutaway) cloneUnit("putaway", valid.extraPutaway);
	for (const r of next.resources) {
		if (r.kind === "packing" && valid.packingDurationMs !== void 0) r.serviceDurationMs = valid.packingDurationMs;
		if (r.kind === "dispatch" && valid.dispatchDurationMs !== void 0) r.serviceDurationMs = valid.dispatchDurationMs;
		if (r.kind === "receiving" && valid.receivingDurationMs !== void 0) r.serviceDurationMs = valid.receivingDurationMs;
	}
	return parseOperationsScenario(next);
}
var INTERVENTION_FIELDS = [
	"extraPickers",
	"extraPutaway",
	"packingDurationMs",
	"dispatchDurationMs",
	"receivingDurationMs"
];
var PATCH_BOUNDS = {
	extraPickers: {
		min: 0,
		max: 2
	},
	extraPutaway: {
		min: 0,
		max: 2
	},
	packingDurationMs: {
		min: 1e3,
		max: 3e5
	},
	dispatchDurationMs: {
		min: 1e3,
		max: 3e5
	},
	receivingDurationMs: {
		min: 1e3,
		max: 3e5
	}
};
var rangeSchema = strictObject({
	min: number().int(),
	max: number().int()
});
var interventionPolicySchema = strictObject({
	allowedFields: array(_enum(INTERVENTION_FIELDS)).max(5),
	ranges: strictObject({
		extraPickers: rangeSchema.optional(),
		extraPutaway: rangeSchema.optional(),
		packingDurationMs: rangeSchema.optional(),
		dispatchDurationMs: rangeSchema.optional(),
		receivingDurationMs: rangeSchema.optional()
	}).optional()
}).superRefine((p, ctx) => {
	const seen = /* @__PURE__ */ new Set();
	for (const f of p.allowedFields) {
		if (seen.has(f)) ctx.addIssue({
			code: "custom",
			message: `duplicate allowed field: ${f}`
		});
		seen.add(f);
	}
	for (const [field, range] of Object.entries(p.ranges ?? {})) {
		if (!range) continue;
		if (!p.allowedFields.includes(field)) ctx.addIssue({
			code: "custom",
			message: `range given for field that is not allowed: ${field}`
		});
		const bounds = PATCH_BOUNDS[field];
		if (range.min > range.max || range.min < bounds.min || range.max > bounds.max) ctx.addIssue({
			code: "custom",
			message: `range for ${field} must satisfy ${bounds.min} <= min <= max <= ${bounds.max}`
		});
	}
});
function parseInterventionPolicy(value) {
	return interventionPolicySchema.parse(value);
}
var STAFFING_FIELDS = ["extraPickers", "extraPutaway"];
function isNoChangePatch(patch) {
	return INTERVENTION_FIELDS.every((f) => {
		const v = patch[f];
		return v === void 0 || STAFFING_FIELDS.includes(f) && v === 0;
	});
}
function policyViolation(patch, policy) {
	for (const f of INTERVENTION_FIELDS) {
		const v = patch[f];
		if (v === void 0) continue;
		if (STAFFING_FIELDS.includes(f) && v === 0) continue;
		if (!policy.allowedFields.includes(f)) return STAFFING_FIELDS.includes(f) ? `patch field ${f}=${v} adds workers but staffing is not allowed by the intervention policy (allowed: ${policy.allowedFields.join(", ") || "none"})` : `patch field ${f} is not allowed by the intervention policy (allowed: ${policy.allowedFields.join(", ") || "none"})`;
		const range = policy.ranges?.[f];
		if (range && (v < range.min || v > range.max)) return `patch field ${f}=${v} is outside the policy range ${range.min}..${range.max}`;
	}
	return null;
}
var OPERATIONS_EXPERIMENT_SCHEMA = "layoutlab.operations-experiment/2";
function invalidCandidate(candidateId, isBaseline, requestedPatch, patch, reasonCode, reason) {
	return {
		candidateId,
		isBaseline,
		requestedPatch: structuredClone(requestedPatch),
		patch: patch ? { ...patch } : null,
		status: "invalid",
		reasonCode,
		reason,
		completionStage: null,
		shipped: null,
		backlog: null,
		stageBacklog: null,
		makespanMs: null,
		lastShippedAtMs: null,
		totalWaitMs: null,
		stopClockMs: null,
		termination: null,
		report: null
	};
}
function rankCandidates(candidates) {
	return [...candidates.filter((c) => c.status === "valid-complete" || c.status === "valid-incomplete")].sort((a, b) => {
		const ac = a.status === "valid-complete";
		const bc = b.status === "valid-complete";
		if (ac !== bc) return ac ? -1 : 1;
		if (a.shipped !== b.shipped) return (b.shipped ?? 0) - (a.shipped ?? 0);
		if (ac && bc) {
			const am = a.makespanMs ?? Number.POSITIVE_INFINITY;
			const bm = b.makespanMs ?? Number.POSITIVE_INFINITY;
			if (am !== bm) return am - bm;
			if (a.totalWaitMs !== b.totalWaitMs) return (a.totalWaitMs ?? 0) - (b.totalWaitMs ?? 0);
		}
		if (a.backlog !== b.backlog) return (a.backlog ?? 0) - (b.backlog ?? 0);
		return a.candidateId < b.candidateId ? -1 : 1;
	}).map((c) => c.candidateId);
}
function runOperationsExperiment(input) {
	if (!input || typeof input !== "object") throw new Error("experiment input must be an object");
	const scenario = parseOperationsScenario(structuredClone(input.scenario));
	const executionConfig = parseOperationsExecutionConfig(structuredClone(input.executionConfig));
	const policy = input.interventionPolicy === void 0 ? { allowedFields: [] } : parseInterventionPolicy(structuredClone(input.interventionPolicy));
	const safetyCeilingMs = input.safetyCeilingMs ?? input.terminationPolicy?.safetyCeilingMs ?? 72e5;
	if (!Number.isSafeInteger(safetyCeilingMs) || safetyCeilingMs < 1 || safetyCeilingMs > 2147483647) throw new Error("safetyCeilingMs must be an integer in 1..2147483647");
	const rawCandidates = input.candidates ?? [];
	if (!Array.isArray(rawCandidates)) throw new Error("candidates must be an array");
	if (rawCandidates.length > 8) throw new Error("experiment allows at most 8 total candidates including baseline");
	const seen = /* @__PURE__ */ new Set();
	for (const c of rawCandidates) {
		if (!c || typeof c !== "object" || typeof c.candidateId !== "string" || c.candidateId.length === 0 || c.candidateId.length > 128) throw new Error("each candidate needs a candidateId of 1..128 characters");
		if (seen.has(c.candidateId)) throw new Error(`duplicate candidate id ${c.candidateId}`);
		seen.add(c.candidateId);
	}
	const baselineIdx = rawCandidates.map((c) => {
		try {
			return {
				ok: true,
				patch: parseOperationsPatch(c.patch ?? {})
			};
		} catch {
			return {
				ok: false,
				patch: null
			};
		}
	}).findIndex((p) => p.ok && isNoChangePatch(p.patch));
	if (seen.has("baseline")) {
		if (rawCandidates.findIndex((c) => c.candidateId === "baseline") !== baselineIdx) throw new Error("candidateId baseline is reserved for the empty-patch baseline");
	}
	let ordered;
	let baselineCandidateId;
	if (baselineIdx >= 0) {
		ordered = rawCandidates.map((c) => ({
			candidateId: c.candidateId,
			requestedPatch: c.patch ?? {},
			auto: false
		}));
		baselineCandidateId = rawCandidates[baselineIdx].candidateId;
	} else {
		if (rawCandidates.length >= 8) throw new Error("experiment allows at most 8 total candidates including baseline; add an empty-patch baseline or drop a candidate");
		ordered = [{
			candidateId: "baseline",
			requestedPatch: {},
			auto: true
		}, ...rawCandidates.map((c) => ({
			candidateId: c.candidateId,
			requestedPatch: c.patch ?? {},
			auto: false
		}))];
		baselineCandidateId = "baseline";
	}
	const candidates = [];
	let baselineSeen = false;
	for (const entry of ordered) {
		const isBaseline = entry.candidateId === baselineCandidateId;
		let patch;
		try {
			patch = parseOperationsPatch(structuredClone(entry.requestedPatch ?? {}));
		} catch (e) {
			candidates.push(invalidCandidate(entry.candidateId, isBaseline, entry.requestedPatch, null, "INVALID_PATCH", `invalid patch: ${e instanceof Error ? e.message : "patch failed validation"}`));
			continue;
		}
		if (isNoChangePatch(patch)) {
			if (baselineSeen) {
				candidates.push(invalidCandidate(entry.candidateId, false, entry.requestedPatch, patch, "DUPLICATE_BASELINE", `duplicate baseline: no-change patch already evaluated once as ${baselineCandidateId}`));
				continue;
			}
			baselineSeen = true;
		}
		const violation = policyViolation(patch, policy);
		if (violation) {
			candidates.push(invalidCandidate(entry.candidateId, isBaseline, entry.requestedPatch, patch, "POLICY_VIOLATION", violation));
			continue;
		}
		let patched;
		try {
			patched = applyOperationsPatch(scenario, patch);
		} catch (e) {
			candidates.push(invalidCandidate(entry.candidateId, isBaseline, entry.requestedPatch, patch, "PATCHED_SCENARIO_INVALID", `patched scenario invalid: ${e instanceof Error ? e.message : "patch produced an invalid scenario"}`));
			continue;
		}
		let controller;
		try {
			controller = createOperationsController({
				scenario: patched,
				executionConfig
			});
		} catch (e) {
			candidates.push(invalidCandidate(entry.candidateId, isBaseline, entry.requestedPatch, patch, "PATCHED_SCENARIO_INFEASIBLE", `patched scenario infeasible: ${e instanceof Error ? e.message : "controller rejected the patched scenario"}`));
			continue;
		}
		try {
			const termination = runOperationsToTermination(controller, safetyCeilingMs);
			const report = controller.exportReport();
			const metrics = operationsRunMetrics(controller.snapshot(), report.completionStage);
			const complete = report.completionStage === "SUPPORTED_STAGE_COMPLETE";
			const failedChecks = [
				"conservation",
				"capacity",
				"safety"
			].filter((k) => report.checks[k].length > 0).map((k) => `${k}: ${report.checks[k].join("; ")}`);
			const checksFailed = failedChecks.length > 0;
			candidates.push({
				candidateId: entry.candidateId,
				isBaseline,
				requestedPatch: structuredClone(entry.requestedPatch),
				patch: { ...patch },
				status: checksFailed ? "checks-failed" : complete ? "valid-complete" : "valid-incomplete",
				reasonCode: checksFailed ? "CHECKS_FAILED" : complete ? null : "RUN_INCOMPLETE",
				reason: checksFailed ? `invariant checks failed (${failedChecks.join(" | ")}); run is not valid, report preserved as evidence` : complete ? null : `run stopped ${termination.stopReason} at ${termination.stopClockMs}ms with stage ${report.completionStage}; backlog retained, no makespan claimed`,
				completionStage: report.completionStage,
				shipped: report.counts.shipped,
				backlog: report.counts.backlog,
				stageBacklog: report.counts.stageBacklog,
				makespanMs: metrics.makespanMs,
				lastShippedAtMs: metrics.lastShippedAtMs,
				totalWaitMs: metrics.totalWaitMs,
				stopClockMs: termination.stopClockMs,
				termination,
				report
			});
		} catch (e) {
			candidates.push({
				...invalidCandidate(entry.candidateId, isBaseline, entry.requestedPatch, patch, "RUN_ERROR", `run error: ${e instanceof Error ? e.message : "engine run failed"}`),
				status: "error"
			});
		}
	}
	const rankedCandidateIds = rankCandidates(candidates);
	return {
		schema: OPERATIONS_EXPERIMENT_SCHEMA,
		scenarioId: scenario.id,
		seed: scenario.seed,
		versions: {
			simulation: SIMULATION_VERSION,
			operationsSchema: OPERATIONS_SCHEMA_VERSION,
			operationsEngine: OPERATIONS_ENGINE_VERSION,
			evaluator: OPERATIONS_EXPERIMENT_SCHEMA
		},
		commonInputs: {
			scenario: structuredClone(scenario),
			executionConfig: { ...executionConfig }
		},
		interventionPolicy: structuredClone(policy),
		terminationPolicy: { safetyCeilingMs },
		baselineCandidateId,
		candidates,
		rankedCandidateIds,
		selectedCandidateId: rankedCandidateIds[0] ?? null,
		assumptions: [
			"synthetic scenario: all workload, geometry and service values are constructed test inputs, not calibrated measurements",
			"service-duration patch values are synthetic service assumptions, not measured money or time savings",
			"only the listed intervention fields may differ between candidates; orders, deliveries, initial inventory, seed, geometry, navigation and execution config stay frozen",
			"offline recomputation proves saved values follow from the embedded inputs, not who produced the file"
		]
	};
}
function canonical(value) {
	if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
}
function verifyOperationsExperiment(exported) {
	const mismatches = [];
	const none = {
		recomputedRankedCandidateIds: [],
		recomputedSelectedCandidateId: null
	};
	if (!exported || typeof exported !== "object") return {
		ok: false,
		mismatches: ["experiment export must be an object"],
		...none
	};
	const exp = exported;
	if (exp.schema === "layoutlab.operations-experiment/1") return {
		ok: false,
		mismatches: ["legacy experiment schema layoutlab.operations-experiment/1 lacks policy/common-input evidence; not fully verifiable"],
		...none
	};
	if (exp.schema !== "layoutlab.operations-experiment/2") return {
		ok: false,
		mismatches: [`unsupported experiment schema ${String(exp.schema)}`],
		...none
	};
	let scenario;
	let executionConfig;
	let policy;
	try {
		scenario = parseOperationsScenario(structuredClone(exp.commonInputs?.scenario));
		executionConfig = parseOperationsExecutionConfig(structuredClone(exp.commonInputs?.executionConfig));
		policy = parseInterventionPolicy(structuredClone(exp.interventionPolicy));
	} catch (e) {
		return {
			ok: false,
			mismatches: [`common inputs/policy: ${e instanceof Error ? e.message : "invalid"}`],
			...none
		};
	}
	if (exp.scenarioId !== scenario.id) mismatches.push(`scenarioId: saved ${String(exp.scenarioId)} != common scenario ${scenario.id}`);
	if (exp.seed !== scenario.seed) mismatches.push(`seed: saved ${String(exp.seed)} != common scenario ${scenario.seed}`);
	const wantVersions = {
		simulation: SIMULATION_VERSION,
		operationsSchema: OPERATIONS_SCHEMA_VERSION,
		operationsEngine: OPERATIONS_ENGINE_VERSION,
		evaluator: OPERATIONS_EXPERIMENT_SCHEMA
	};
	for (const k of Object.keys(wantVersions)) if (exp.versions?.[k] !== wantVersions[k]) mismatches.push(`versions.${k}: saved ${String(exp.versions?.[k])} != current ${wantVersions[k]}`);
	const declaredCeiling = exp.terminationPolicy?.safetyCeilingMs;
	if (!exp.terminationPolicy || typeof exp.terminationPolicy !== "object" || typeof declaredCeiling !== "number" || !Number.isSafeInteger(declaredCeiling) || declaredCeiling < 1 || declaredCeiling > 2147483647) return {
		ok: false,
		mismatches: [...mismatches, "terminationPolicy.safetyCeilingMs: missing or invalid declared termination metadata; verifier does not invent it"],
		...none
	};
	if (!Array.isArray(exp.candidates) || exp.candidates.length === 0) return {
		ok: false,
		mismatches: [...mismatches, "candidates: missing or empty"],
		...none
	};
	const savedIds = exp.candidates.map((c) => c.candidateId);
	if (new Set(savedIds).size !== savedIds.length) mismatches.push("candidates: duplicate candidate ids in saved export");
	let rerun;
	try {
		rerun = runOperationsExperiment({
			scenario,
			executionConfig,
			interventionPolicy: policy,
			safetyCeilingMs: declaredCeiling,
			candidates: exp.candidates.map((c) => ({
				candidateId: c.candidateId,
				patch: structuredClone(c.requestedPatch ?? {})
			}))
		});
	} catch (e) {
		return {
			ok: false,
			mismatches: [...mismatches, `rerun: ${e instanceof Error ? e.message : "rerun failed"}`],
			...none
		};
	}
	const freshById = new Map(rerun.candidates.map((c) => [c.candidateId, c]));
	if (canonical(savedIds) !== canonical(rerun.candidates.map((c) => c.candidateId))) mismatches.push(`candidates: saved order/ids [${savedIds.join(",")}] != recomputed [${rerun.candidates.map((c) => c.candidateId).join(",")}] (missing or extra candidates)`);
	for (const saved of exp.candidates) {
		const fresh = freshById.get(saved.candidateId);
		if (!fresh) {
			mismatches.push(`candidate ${saved.candidateId}: missing on recomputation`);
			continue;
		}
		if (saved.patch) {
			const violation = policyViolation(saved.patch, policy);
			if (violation && (saved.status === "valid-complete" || saved.status === "valid-incomplete")) mismatches.push(`candidate ${saved.candidateId}: saved as valid but violates policy: ${violation}`);
		}
		if (saved.status === "valid-complete" || saved.status === "valid-incomplete" || saved.status === "checks-failed") {
			if (!saved.termination || typeof saved.termination !== "object") mismatches.push(`candidate ${saved.candidateId}.termination: missing declared termination`);
			else {
				if (saved.termination.safetyCeilingMs !== declaredCeiling) mismatches.push(`candidate ${saved.candidateId}.termination.safetyCeilingMs: saved ${String(saved.termination.safetyCeilingMs)} != comparison ceiling ${declaredCeiling}`);
				if (saved.termination.stopClockMs !== saved.stopClockMs) mismatches.push(`candidate ${saved.candidateId}.termination.stopClockMs: saved ${String(saved.termination.stopClockMs)} != candidate stopClockMs ${String(saved.stopClockMs)}`);
				if (typeof saved.termination.stopReason !== "string" || saved.termination.stopReason.length === 0) mismatches.push(`candidate ${saved.candidateId}.termination.stopReason: missing declared stop reason`);
			}
		}
		for (const f of [
			"isBaseline",
			"patch",
			"status",
			"reasonCode",
			"reason",
			"completionStage",
			"shipped",
			"backlog",
			"stageBacklog",
			"makespanMs",
			"lastShippedAtMs",
			"totalWaitMs",
			"stopClockMs",
			"termination"
		]) if (canonical(saved[f]) !== canonical(fresh[f])) mismatches.push(`candidate ${saved.candidateId}.${f}: saved ${canonical(saved[f])} != recomputed ${canonical(fresh[f])}`);
		if (canonical(saved.report) !== canonical(fresh.report)) mismatches.push(`candidate ${saved.candidateId}.report: saved report differs from recomputed report (counts/timestamps/checks/clock/metrics)`);
		if (saved.report && fresh.patch) {
			try {
				const reconstructed = applyOperationsPatch(scenario, fresh.patch);
				if (canonical(saved.report.scenario) !== canonical(reconstructed)) mismatches.push(`candidate ${saved.candidateId}: saved per-run scenario differs from common inputs + patch (tampered common or per-run inputs)`);
			} catch {}
			const rep = recomputeOperationsReport(saved.report);
			for (const m of rep.mismatches) mismatches.push(`candidate ${saved.candidateId}.report: ${m}`);
		}
	}
	if (canonical(exp.rankedCandidateIds) !== canonical(rerun.rankedCandidateIds)) mismatches.push(`rankedCandidateIds: saved ${canonical(exp.rankedCandidateIds)} != recomputed ${canonical(rerun.rankedCandidateIds)}`);
	if (exp.selectedCandidateId !== rerun.selectedCandidateId) mismatches.push(`selectedCandidateId: saved ${String(exp.selectedCandidateId)} != recomputed ${String(rerun.selectedCandidateId)}`);
	if (exp.baselineCandidateId !== rerun.baselineCandidateId) mismatches.push(`baselineCandidateId: saved ${String(exp.baselineCandidateId)} != recomputed ${String(rerun.baselineCandidateId)}`);
	return {
		ok: mismatches.length === 0,
		mismatches,
		recomputedRankedCandidateIds: rerun.rankedCandidateIds,
		recomputedSelectedCandidateId: rerun.selectedCandidateId
	};
}
// packages/simulation/src/layout/hash.ts
function canonicalStringify(value) {
	if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
	if (Array.isArray(value)) return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
	const record = value;
	return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`).join(",")}}`;
}
async function sha256Hex(text) {
	const subtle = globalThis.crypto?.subtle;
	if (!subtle) throw new Error("WebCrypto subtle is unavailable in this runtime; content hashing requires it (browser or Node >= 19)");
	const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function contentSha256(value) {
	return sha256Hex(canonicalStringify(value));
}
// packages/simulation/src/layout/contract.ts
var LAYOUT_DRAFT_VERSION = "layoutlab.layout-draft/2";
var LAYOUT_COMPARISON_SCHEMA = "layoutlab.layout-comparison/2";
var COORDINATE_SYSTEM = "room-mm:x-east,z-north,origin-(0,0),integer-mm";
var SUPPORTED_KIND = "PACKING_STATION_TRANSLATION";
var UNSUPPORTED_KINDS = [
	"RACK_QUARTER_TURN",
	"RACK_TRANSLATION",
	"AGENT_INITIAL_PLACEMENT"
];
var LOCKED_ENTITY_IDS = ["RCV-1"];
function defaultApprovedConstraints(allowedEntityIds) {
	return {
		allowedEntityIds: [...allowedEntityIds],
		lockedEntityIds: [...LOCKED_ENTITY_IDS],
		maxMovedEntities: 1,
		maxTranslationMm: 5e3,
		snapGridMm: 100,
		requireSameWorkerCount: true,
		requireSameServiceDurations: true,
		requireSameWorkload: true,
		requireSameSeed: true
	};
}
/** @deprecated Use defaultApprovedConstraints (approved-context builder). */
var defaultConstraints = defaultApprovedConstraints;
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isInt(value) {
	return typeof value === "number" && Number.isSafeInteger(value);
}
function issue(code, entityId, message, field) {
	return {
		code,
		severity: "error",
		entityId,
		message,
		...field ? { field } : {}
	};
}
var PROPOSAL_KEYS = [
	"kind",
	"proposalId",
	"parent",
	"entityId",
	"target"
];
var PARENT_KEYS = [
	"scenarioId",
	"scenarioContentSha256",
	"schemaVersion",
	"engineVersion"
];
var CONSTRAINT_KEYS = [
	"allowedEntityIds",
	"lockedEntityIds",
	"maxMovedEntities",
	"maxTranslationMm",
	"snapGridMm",
	"requireSameWorkerCount",
	"requireSameServiceDurations",
	"requireSameWorkload",
	"requireSameSeed"
];
function parseLayoutProposal(value) {
	if (!isRecord(value)) return {
		ok: false,
		issues: [issue("SCHEMA_INVALID", null, "proposal must be an object")]
	};
	const kind = value["kind"];
	if (typeof kind === "string" && UNSUPPORTED_KINDS.includes(kind)) {
		const entityId = typeof value["entityId"] === "string" ? value["entityId"] : "";
		return {
			ok: true,
			supported: false,
			proposal: {
				kind,
				proposalId: typeof value["proposalId"] === "string" ? value["proposalId"] : "",
				entityId
			}
		};
	}
	if (kind !== "PACKING_STATION_TRANSLATION") return {
		ok: false,
		issues: [issue("SCHEMA_INVALID", null, `unsupported proposal kind: ${String(kind)}`, "kind")]
	};
	const issues = [];
	for (const key of Object.keys(value)) if (!PROPOSAL_KEYS.includes(key)) issues.push(issue("SCHEMA_INVALID", null, key === "constraints" ? "proposal must not carry constraints: approved constraints are supplied separately by the user/server context" : `unknown proposal key: ${key}`, key));
	const proposalId = value["proposalId"];
	const entityId = value["entityId"];
	if (typeof proposalId !== "string" || proposalId.length === 0 || proposalId.length > 128) issues.push(issue("SCHEMA_INVALID", null, "proposalId must be a string of 1..128 chars", "proposalId"));
	if (typeof entityId !== "string" || entityId.length === 0 || entityId.length > 128) issues.push(issue("SCHEMA_INVALID", null, "entityId must be a string of 1..128 chars", "entityId"));
	const parent = value["parent"];
	if (!isRecord(parent)) issues.push(issue("SCHEMA_INVALID", null, "parent must be an object", "parent"));
	else {
		for (const key of Object.keys(parent)) if (!PARENT_KEYS.includes(key)) issues.push(issue("SCHEMA_INVALID", null, `unknown parent key: ${key}`, `parent.${key}`));
		for (const key of PARENT_KEYS) if (typeof parent[key] !== "string" || parent[key].length === 0) issues.push(issue("SCHEMA_INVALID", null, `parent.${key} must be a non-empty string`, `parent.${key}`));
	}
	const target = value["target"];
	let parsedTarget = null;
	if (!isRecord(target)) issues.push(issue("SCHEMA_INVALID", null, "target must be an object", "target"));
	else if (target["mode"] === "ABSOLUTE_CENTER_MM") {
		const centre = target["centerMm"];
		if (!isRecord(centre) || !isInt(centre["x"]) || !isInt(centre["z"])) issues.push(issue("SCHEMA_INVALID", typeof entityId === "string" ? entityId : null, "target.centerMm must have integer x/z (mm, room frame)", "target.centerMm"));
		else parsedTarget = {
			mode: "ABSOLUTE_CENTER_MM",
			centerMm: {
				x: centre["x"],
				z: centre["z"]
			}
		};
		for (const key of Object.keys(target)) if (!["mode", "centerMm"].includes(key)) issues.push(issue("SCHEMA_INVALID", null, `unknown target key: ${key}`, `target.${key}`));
	} else if (target["mode"] === "DELTA_MM") {
		const delta = target["deltaMm"];
		if (!isRecord(delta) || !isInt(delta["dx"]) || !isInt(delta["dz"])) issues.push(issue("SCHEMA_INVALID", typeof entityId === "string" ? entityId : null, "target.deltaMm must have integer dx/dz (mm, room frame)", "target.deltaMm"));
		else parsedTarget = {
			mode: "DELTA_MM",
			deltaMm: {
				dx: delta["dx"],
				dz: delta["dz"]
			}
		};
		for (const key of Object.keys(target)) if (!["mode", "deltaMm"].includes(key)) issues.push(issue("SCHEMA_INVALID", null, `unknown target key: ${key}`, `target.${key}`));
	} else issues.push(issue("SCHEMA_INVALID", null, "target.mode must be ABSOLUTE_CENTER_MM or DELTA_MM", "target.mode"));
	if (issues.length > 0 || !parsedTarget || !isRecord(parent)) return {
		ok: false,
		issues
	};
	return {
		ok: true,
		supported: true,
		proposal: {
			kind: SUPPORTED_KIND,
			proposalId,
			parent: {
				scenarioId: parent["scenarioId"],
				scenarioContentSha256: parent["scenarioContentSha256"],
				schemaVersion: parent["schemaVersion"],
				engineVersion: parent["engineVersion"]
			},
			entityId,
			target: parsedTarget
		}
	};
}
function parseApprovedConstraints(value) {
	if (!isRecord(value)) return {
		ok: false,
		issues: [issue("APPROVED_CONSTRAINTS_REQUIRED", null, "approved constraints must be supplied by the user/server context as an object, independently of the proposal")]
	};
	const issues = [];
	for (const key of Object.keys(value)) if (!CONSTRAINT_KEYS.includes(key)) issues.push(issue("SCHEMA_INVALID", null, `unknown approved-constraints key: ${key}`, `approvedConstraints.${key}`));
	const allowed = value["allowedEntityIds"];
	const locked = value["lockedEntityIds"];
	const maxMoved = value["maxMovedEntities"];
	const maxTranslation = value["maxTranslationMm"];
	const grid = value["snapGridMm"];
	if (!Array.isArray(allowed) || allowed.some((v) => typeof v !== "string")) issues.push(issue("SCHEMA_INVALID", null, "approvedConstraints.allowedEntityIds must be a string array", "approvedConstraints.allowedEntityIds"));
	if (!Array.isArray(locked) || locked.some((v) => typeof v !== "string")) issues.push(issue("SCHEMA_INVALID", null, "approvedConstraints.lockedEntityIds must be a string array", "approvedConstraints.lockedEntityIds"));
	if (!isInt(maxMoved) || maxMoved < 0) issues.push(issue("SCHEMA_INVALID", null, "approvedConstraints.maxMovedEntities must be a non-negative integer", "approvedConstraints.maxMovedEntities"));
	if (!isInt(maxTranslation) || maxTranslation < 0) issues.push(issue("SCHEMA_INVALID", null, "approvedConstraints.maxTranslationMm must be a non-negative integer", "approvedConstraints.maxTranslationMm"));
	if (!isInt(grid) || grid < 1) issues.push(issue("SCHEMA_INVALID", null, "approvedConstraints.snapGridMm must be a positive integer", "approvedConstraints.snapGridMm"));
	for (const flag of [
		"requireSameWorkerCount",
		"requireSameServiceDurations",
		"requireSameWorkload",
		"requireSameSeed"
	]) if (value[flag] !== true) issues.push(issue("SCHEMA_INVALID", null, `approvedConstraints.${flag} must be true: matched exogenous inputs are not optional`, `approvedConstraints.${flag}`));
	if (issues.length > 0) return {
		ok: false,
		issues
	};
	return {
		ok: true,
		constraints: {
			allowedEntityIds: [...allowed],
			lockedEntityIds: [...locked],
			maxMovedEntities: maxMoved,
			maxTranslationMm: maxTranslation,
			snapGridMm: grid,
			requireSameWorkerCount: true,
			requireSameServiceDurations: true,
			requireSameWorkload: true,
			requireSameSeed: true
		}
	};
}
function snapToGridMm(valueMm, gridMm) {
	if (!Number.isSafeInteger(valueMm) || !Number.isSafeInteger(gridMm) || gridMm < 1) throw new Error("snapToGridMm requires integer mm and a positive integer grid");
	return Math.round(valueMm / gridMm) * gridMm;
}
function resolveTargetCentre(proposal, currentCentreMm) {
	if (proposal.target.mode === "ABSOLUTE_CENTER_MM") {
		const centreMm = { ...proposal.target.centerMm };
		return {
			centreMm,
			deltaMm: {
				dx: centreMm.x - currentCentreMm.x,
				dz: centreMm.z - currentCentreMm.z
			}
		};
	}
	const deltaMm = { ...proposal.target.deltaMm };
	return {
		centreMm: {
			x: currentCentreMm.x + deltaMm.dx,
			z: currentCentreMm.z + deltaMm.dz
		},
		deltaMm
	};
}
async function validateProposalAgainstBaseline(proposal, baseline, supportedEntityIds, approved) {
	const issues = [];
	const entityId = proposal.entityId;
	if (proposal.parent.scenarioId !== baseline.id) issues.push(issue("STALE_REVISION", entityId, `parent scenarioId ${proposal.parent.scenarioId} != baseline ${baseline.id}`, "parent.scenarioId"));
	const actualHash = await contentSha256(baseline);
	if (proposal.parent.scenarioContentSha256 !== actualHash) issues.push(issue("STALE_REVISION", entityId, `parent scenarioContentSha256 ${proposal.parent.scenarioContentSha256} != baseline content ${actualHash}`, "parent.scenarioContentSha256"));
	if (proposal.parent.schemaVersion !== baseline.schemaVersion) issues.push(issue("SCHEMA_VERSION_MISMATCH", entityId, `parent schemaVersion ${proposal.parent.schemaVersion} != baseline ${baseline.schemaVersion}`, "parent.schemaVersion"));
	if (proposal.parent.engineVersion !== baseline.engineVersion) issues.push(issue("SCHEMA_VERSION_MISMATCH", entityId, `parent engineVersion ${proposal.parent.engineVersion} != baseline ${baseline.engineVersion}`, "parent.engineVersion"));
	if ((/* @__PURE__ */ new Set([...LOCKED_ENTITY_IDS, ...approved.lockedEntityIds])).has(entityId)) issues.push(issue("LOCKED_ENTITY", entityId, `entity ${entityId} is locked and may not move`, "entityId"));
	else if (!approved.allowedEntityIds.includes(entityId)) issues.push(issue("NOT_ALLOWED", entityId, `entity ${entityId} is not in approved allowedEntityIds [${approved.allowedEntityIds.join(", ")}]`, "entityId"));
	if (!supportedEntityIds.has(entityId)) issues.push(issue("UNSUPPORTED_ENTITY", entityId, `entity ${entityId} has no validated packing-station attachment bundle in L0`, "entityId"));
	return issues;
}
function validateResolvedTransform(proposal, currentCentreMm, approved) {
	const { centreMm, deltaMm } = resolveTargetCentre(proposal, currentCentreMm);
	const issues = [];
	const entityId = proposal.entityId;
	const grid = approved.snapGridMm;
	if (centreMm.x % grid !== 0 || centreMm.z % grid !== 0 || deltaMm.dx % grid !== 0 || deltaMm.dz % grid !== 0) issues.push(issue("OFF_GRID", entityId, `target centre (${centreMm.x},${centreMm.z}) / delta (${deltaMm.dx},${deltaMm.dz}) is off the ${grid}mm snap grid`, "target"));
	const movedEntities = deltaMm.dx === 0 && deltaMm.dz === 0 ? 0 : 1;
	if (movedEntities > approved.maxMovedEntities) issues.push(issue("MOVE_BUDGET_EXCEEDED", entityId, `proposal moves ${movedEntities} entity(ies) but approved budget maxMovedEntities=${approved.maxMovedEntities}`, "approvedConstraints.maxMovedEntities"));
	const chebyshev = Math.max(Math.abs(deltaMm.dx), Math.abs(deltaMm.dz));
	if (chebyshev > approved.maxTranslationMm) issues.push(issue("MOVE_BUDGET_EXCEEDED", entityId, `translation Chebyshev ${chebyshev}mm exceeds approved budget maxTranslationMm=${approved.maxTranslationMm}mm`, "approvedConstraints.maxTranslationMm"));
	return {
		centreMm,
		deltaMm,
		issues
	};
}
// packages/simulation/src/layout/attachments.ts
var MAIN_WAREHOUSE_ATTACHMENTS = [{
	stationId: "PACK-1",
	resourceId: "PACK-1",
	obstacleId: "OB-PACK1",
	assetRef: "warehouse-environment/table_packing_heavyduty_c01",
	centreMm: {
		x: 20500,
		z: 5e3
	},
	obstacleRectMm: {
		minXMm: 19566,
		minZMm: 4390,
		maxXMm: 21434,
		maxZMm: 5610
	},
	servicePositions: [{
		id: "PACK1-S1",
		x: 20500,
		z: 6900
	}],
	queueSlots: [
		{
			id: "PACK1-Q1",
			x: 22500,
			z: 6900
		},
		{
			id: "PACK1-Q2",
			x: 22500,
			z: 8600
		},
		{
			id: "PACK1-Q3",
			x: 22500,
			z: 10300
		}
	]
}, {
	stationId: "PACK-2",
	resourceId: "PACK-2",
	obstacleId: "OB-PACK2",
	assetRef: "warehouse-environment/table_packing_heavyduty_c01",
	centreMm: {
		x: 20500,
		z: 11e3
	},
	obstacleRectMm: {
		minXMm: 19566,
		minZMm: 10390,
		maxXMm: 21434,
		maxZMm: 11610
	},
	servicePositions: [{
		id: "PACK2-S1",
		x: 20500,
		z: 12900
	}],
	queueSlots: [
		{
			id: "PACK2-Q1",
			x: 22500,
			z: 12e3
		},
		{
			id: "PACK2-Q2",
			x: 22500,
			z: 13700
		},
		{
			id: "PACK2-Q3",
			x: 20500,
			z: 9400
		}
	]
}];
function canonicalRelativeMismatches(canonical, entry) {
	const out = [];
	if (entry.resourceId !== canonical.resourceId) out.push(`resource identity ${entry.resourceId} != canonical ${canonical.resourceId}`);
	if (entry.obstacleId !== canonical.obstacleId) out.push(`obstacle identity ${entry.obstacleId} != canonical ${canonical.obstacleId}`);
	if (entry.assetRef !== canonical.assetRef) out.push(`asset identity differs from canonical ${canonical.assetRef}`);
	const dims = (r) => [r.maxXMm - r.minXMm, r.maxZMm - r.minZMm];
	const [cw, cd] = dims(canonical.obstacleRectMm);
	const [ew, ed] = dims(entry.obstacleRectMm);
	if (ew !== cw || ed !== cd) out.push(`obstacle dimensions ${ew}x${ed} != canonical ${cw}x${cd}`);
	const relRect = (r, c) => `${r.minXMm - c.x},${r.minZMm - c.z},${r.maxXMm - c.x},${r.maxZMm - c.z}`;
	if (relRect(entry.obstacleRectMm, entry.centreMm) !== relRect(canonical.obstacleRectMm, canonical.centreMm)) out.push("obstacle rect offset from centre differs from canonical (non-rigid or swapped footprint)");
	const relSlots = (slots, c) => slots.map((s) => `${s.id}:${s.x - c.x},${s.z - c.z}`).sort().join(";");
	if (relSlots(entry.servicePositions, entry.centreMm) !== relSlots(canonical.servicePositions, canonical.centreMm)) out.push("service position offsets from centre differ from canonical");
	if (relSlots(entry.queueSlots, entry.centreMm) !== relSlots(canonical.queueSlots, canonical.centreMm)) out.push("queue slot offsets from centre differ from canonical");
	return out;
}
var LayoutAttachmentError = class extends Error {
	code = "ATTACHMENT_MISMATCH";
	mismatches;
	constructor(mismatches) {
		super(`attachment map does not match the canonical scenario: ${mismatches.join("; ")}`);
		this.mismatches = mismatches;
	}
};
function sameSlots(declared, actual) {
	if (declared.length !== actual.length) return false;
	const byId = new Map(actual.map((s) => [s.id, s]));
	return declared.every((d) => {
		const a = byId.get(d.id);
		return a !== void 0 && a.x === d.x && a.z === d.z;
	});
}
function buildStationAttachmentMap(scenario, declared) {
	const mismatches = [];
	const out = /* @__PURE__ */ new Map();
	const seenResources = /* @__PURE__ */ new Set();
	const seenObstacles = /* @__PURE__ */ new Set();
	const seenSlots = /* @__PURE__ */ new Set();
	for (const entry of declared) {
		if (entry.stationId !== entry.resourceId) mismatches.push(`${entry.stationId}: stationId must equal resourceId (alias onto resource ${entry.resourceId} is not canonical ownership)`);
		if (out.has(entry.stationId)) mismatches.push(`${entry.stationId}: duplicate station bundle`);
		if (seenResources.has(entry.resourceId)) mismatches.push(`${entry.stationId}: resource ${entry.resourceId} already claimed by another bundle`);
		if (seenObstacles.has(entry.obstacleId)) mismatches.push(`${entry.stationId}: obstacle ${entry.obstacleId} already claimed by another bundle`);
		seenResources.add(entry.resourceId);
		seenObstacles.add(entry.obstacleId);
		for (const slot of [...entry.servicePositions, ...entry.queueSlots]) {
			if (seenSlots.has(slot.id)) mismatches.push(`${entry.stationId}: slot ${slot.id} already claimed by another bundle`);
			seenSlots.add(slot.id);
		}
		if (scenario.id === "main-warehouse-1") {
			const canonical = MAIN_WAREHOUSE_ATTACHMENTS.find((a) => a.stationId === entry.stationId);
			if (!canonical) mismatches.push(`${entry.stationId}: no canonical ownership entry for main-warehouse-1`);
			else for (const detail of canonicalRelativeMismatches(canonical, entry)) mismatches.push(`${entry.stationId}: bundle differs from canonical main-warehouse-1 ownership (${detail})`);
		}
		const resource = scenario.resources.find((r) => r.id === entry.resourceId);
		if (!resource) {
			mismatches.push(`${entry.stationId}: resource ${entry.resourceId} not found`);
			continue;
		}
		if (resource.kind !== "packing") mismatches.push(`${entry.stationId}: resource ${entry.resourceId} is kind ${resource.kind}, not packing`);
		const obstacle = scenario.geometry.obstacles.find((o) => o.id === entry.obstacleId);
		if (!obstacle) mismatches.push(`${entry.stationId}: obstacle ${entry.obstacleId} not found`);
		else {
			const rect = entry.obstacleRectMm;
			if (obstacle.minXMm !== rect.minXMm || obstacle.maxXMm !== rect.maxXMm || obstacle.minZMm !== rect.minZMm || obstacle.maxZMm !== rect.maxZMm) mismatches.push(`${entry.stationId}: obstacle ${entry.obstacleId} rect ${obstacle.minXMm}..${obstacle.maxXMm} x ${obstacle.minZMm}..${obstacle.maxZMm} != declared ${rect.minXMm}..${rect.maxXMm} x ${rect.minZMm}..${rect.maxZMm}`);
			const centreX = (obstacle.minXMm + obstacle.maxXMm) / 2;
			const centreZ = (obstacle.minZMm + obstacle.maxZMm) / 2;
			if (centreX !== entry.centreMm.x || centreZ !== entry.centreMm.z) mismatches.push(`${entry.stationId}: obstacle centre (${centreX},${centreZ}) != declared centre (${entry.centreMm.x},${entry.centreMm.z})`);
		}
		if (!sameSlots(entry.servicePositions, resource.servicePositions)) mismatches.push(`${entry.stationId}: declared servicePositions ${JSON.stringify(entry.servicePositions)} != resource ${JSON.stringify(resource.servicePositions)}`);
		if (!sameSlots(entry.queueSlots, resource.queueSlots)) mismatches.push(`${entry.stationId}: declared queueSlots ${JSON.stringify(entry.queueSlots)} != resource ${JSON.stringify(resource.queueSlots)}`);
		out.set(entry.stationId, structuredClone(entry));
	}
	if (mismatches.length > 0) throw new LayoutAttachmentError(mismatches);
	return out;
}
function attachmentsFromBindings(scenario, bindings) {
	if (typeof bindings !== "object" || bindings === null) throw new LayoutAttachmentError(["bindings must be an object"]);
	const record = bindings;
	const stations = record["stations"];
	const visuals = record["obstacleVisuals"];
	if (!stations || !visuals) throw new LayoutAttachmentError(["bindings missing stations/obstacleVisuals"]);
	const declared = [];
	for (const [obstacleId, visual] of Object.entries(visuals)) {
		const stationId = visual.stationId;
		if (!stationId) continue;
		const station = stations[stationId];
		const stationCentre = station?.centerMm ?? station?.centreMm;
		if (!stationCentre) throw new LayoutAttachmentError([`${stationId}: bindings station centre missing`]);
		const resource = scenario.resources.find((r) => r.id === stationId);
		const obstacle = scenario.geometry.obstacles.find((o) => o.id === obstacleId);
		if (!resource || !obstacle) throw new LayoutAttachmentError([`${stationId}: scenario resource/obstacle missing for bindings entry`]);
		declared.push({
			stationId,
			resourceId: stationId,
			obstacleId,
			assetRef: station.asset ?? "",
			centreMm: {
				x: stationCentre.x,
				z: stationCentre.z
			},
			obstacleRectMm: {
				minXMm: obstacle.minXMm,
				minZMm: obstacle.minZMm,
				maxXMm: obstacle.maxXMm,
				maxZMm: obstacle.maxZMm
			},
			servicePositions: resource.servicePositions.map((s) => ({ ...s })),
			queueSlots: resource.queueSlots.map((s) => ({ ...s }))
		});
	}
	return buildStationAttachmentMap(scenario, declared);
}
function viewerPlacementFromCandidate(candidate, attachment) {
	const resource = candidate.resources.find((r) => r.id === attachment.resourceId);
	const obstacle = candidate.geometry.obstacles.find((o) => o.id === attachment.obstacleId);
	if (!resource || !obstacle) throw new LayoutAttachmentError([`${attachment.stationId}: candidate is missing its resource or obstacle`]);
	return {
		stationId: attachment.stationId,
		resourceId: attachment.resourceId,
		obstacleId: attachment.obstacleId,
		assetRef: attachment.assetRef,
		centreMm: {
			x: (obstacle.minXMm + obstacle.maxXMm) / 2,
			z: (obstacle.minZMm + obstacle.maxZMm) / 2
		},
		obstacleRectMm: {
			minXMm: obstacle.minXMm,
			minZMm: obstacle.minZMm,
			maxXMm: obstacle.maxXMm,
			maxZMm: obstacle.maxZMm
		},
		servicePositions: resource.servicePositions.map((s) => ({ ...s })),
		queueSlots: resource.queueSlots.map((s) => ({ ...s }))
	};
}
function diffPaths(before, after, base = "") {
	if (Object.is(before, after)) return [];
	if (!(typeof before === "object" && before !== null) || !(typeof after === "object" && after !== null) || Array.isArray(before) !== Array.isArray(after)) return [base || "/"];
	const out = [];
	if (Array.isArray(before) && Array.isArray(after)) {
		const length = Math.max(before.length, after.length);
		for (let i = 0; i < length; i += 1) out.push(...diffPaths(before[i], after[i], `${base}/${i}`));
		return out;
	}
	const keys = /* @__PURE__ */ new Set([...Object.keys(before), ...Object.keys(after)]);
	for (const key of [...keys].sort()) out.push(...diffPaths(before[key], after[key], `${base}/${key}`));
	return out;
}
function getAtJsonPath(value, pointer) {
	let current = value;
	for (const part of pointer.split("/").filter((p) => p.length > 0)) {
		if (typeof current !== "object" || current === null) return void 0;
		current = current[part];
	}
	return current;
}
function isAllowedLayoutPath(path, baseline, attachment) {
	const parts = path.split("/").filter((p) => p.length > 0);
	if (parts[0] === "geometry" && parts[1] === "obstacles") return baseline.geometry.obstacles[Number(parts[2])]?.id === attachment.obstacleId && [
		"minXMm",
		"maxXMm",
		"minZMm",
		"maxZMm"
	].includes(parts[3] ?? "");
	if (parts[0] === "resources") {
		if (baseline.resources[Number(parts[1])]?.id !== attachment.resourceId) return false;
		if (parts[2] === "servicePositions" || parts[2] === "queueSlots") return parts.length === 5 && (parts[4] === "x" || parts[4] === "z");
		return false;
	}
	return false;
}
function applyPackingStationTranslation(baselineRaw, proposal, attachments) {
	const baseline = parseOperationsScenario(structuredClone(baselineRaw));
	const attachment = attachments.get(proposal.entityId);
	if (!attachment) throw new Error(`no validated attachment bundle for station ${proposal.entityId}`);
	if (attachment.stationId !== proposal.entityId || attachment.resourceId !== proposal.entityId) throw new Error(`attachment ownership mismatch: proposal entity ${proposal.entityId} resolves to station ${attachment.stationId} / resource ${attachment.resourceId}; aliases never move another station`);
	const { centreMm: toCentreMm, deltaMm } = resolveTargetCentre(proposal, attachment.centreMm);
	const candidate = structuredClone(baseline);
	const obstacle = candidate.geometry.obstacles.find((o) => o.id === attachment.obstacleId);
	const resource = candidate.resources.find((r) => r.id === attachment.resourceId);
	if (!obstacle || !resource) throw new Error(`station ${proposal.entityId} geometry missing after clone`);
	obstacle.minXMm += deltaMm.dx;
	obstacle.maxXMm += deltaMm.dx;
	obstacle.minZMm += deltaMm.dz;
	obstacle.maxZMm += deltaMm.dz;
	for (const slot of resource.servicePositions) {
		slot.x += deltaMm.dx;
		slot.z += deltaMm.dz;
	}
	for (const slot of resource.queueSlots) {
		slot.x += deltaMm.dx;
		slot.z += deltaMm.dz;
	}
	const parsed = parseOperationsScenario(candidate);
	const attachmentsAfter = viewerPlacementFromCandidate(parsed, attachment);
	return {
		scenario: parsed,
		transform: {
			entityId: proposal.entityId,
			fromCentreMm: { ...attachment.centreMm },
			toCentreMm,
			deltaMm
		},
		attachmentsBefore: structuredClone(attachment),
		attachmentsAfter,
		viewerPlacement: structuredClone(attachmentsAfter),
		changedFields: diffPaths(baseline, parsed)
	};
}
// packages/simulation/src/layout/validator.ts
function rectOfObstacle(o) {
	return {
		minXMm: o.minXMm,
		minZMm: o.minZMm,
		maxXMm: o.maxXMm,
		maxZMm: o.maxZMm
	};
}
function rackRect(r) {
	return {
		minXMm: r.positionMm.x - r.dimensionsMm.width / 2,
		maxXMm: r.positionMm.x + r.dimensionsMm.width / 2,
		minZMm: r.positionMm.z - r.dimensionsMm.depth / 2,
		maxZMm: r.positionMm.z + r.dimensionsMm.depth / 2
	};
}
function interiorOverlap(a, b) {
	return Math.max(a.minXMm, b.minXMm) < Math.min(a.maxXMm, b.maxXMm) && Math.max(a.minZMm, b.minZMm) < Math.min(a.maxZMm, b.maxZMm);
}
function pointInRectInclusive(x, z, r) {
	return x >= r.minXMm && x <= r.maxXMm && z >= r.minZMm && z <= r.maxZMm;
}
function issueKey(i) {
	return `${i.code}|${i.entityId ?? ""}|${i.relatedEntityId ?? ""}|${i.field ?? ""}`;
}
function geometryAccessIssuesFor(scenario) {
	const issues = [];
	const routes = [];
	const room = scenario.geometry.room;
	const physical = [...scenario.geometry.obstacles.map((o) => ({
		id: o.id,
		rect: rectOfObstacle(o)
	})), ...scenario.geometry.racks.map((r) => ({
		id: r.id,
		rect: rackRect(r)
	}))];
	for (const obstacle of scenario.geometry.obstacles) {
		const rect = rectOfObstacle(obstacle);
		if (rect.minXMm < 0 || rect.minZMm < 0 || rect.maxXMm > room.widthMm || rect.maxZMm > room.depthMm) issues.push({
			code: "OUT_OF_ROOM",
			severity: "error",
			entityId: obstacle.id,
			field: "obstacleRectMm",
			message: `obstacle ${obstacle.id} rect ${rect.minXMm}..${rect.maxXMm} x ${rect.minZMm}..${rect.maxZMm} leaves room 0..${room.widthMm} x 0..${room.depthMm}`
		});
	}
	for (const rack of scenario.geometry.racks) {
		const rect = rackRect(rack);
		if (rect.minXMm < 0 || rect.minZMm < 0 || rect.maxXMm > room.widthMm || rect.maxZMm > room.depthMm) issues.push({
			code: "OUT_OF_ROOM",
			severity: "error",
			entityId: rack.id,
			field: "rackRectMm",
			message: `rack ${rack.id} footprint leaves room`
		});
	}
	for (let i = 0; i < physical.length; i += 1) for (let j = i + 1; j < physical.length; j += 1) {
		const a = physical[i];
		const b = physical[j];
		if (interiorOverlap(a.rect, b.rect)) issues.push({
			code: "OVERLAP",
			severity: "error",
			entityId: a.id,
			relatedEntityId: b.id,
			field: "rect",
			message: `physical rect ${a.id} overlaps ${b.id} (interior overlap proven by rect arithmetic)`
		});
	}
	const nav = createTransportNav(scenario);
	const pickers = scenario.mobileUnits.filter((u) => u.role === "picker");
	const putaways = scenario.mobileUnits.filter((u) => u.role === "putaway");
	const checkPoint = (ownerId, slotId, point, navigableFor, coverCode) => {
		if (point.x < 0 || point.z < 0 || point.x > room.widthMm || point.z > room.depthMm) issues.push({
			code: "OUT_OF_ROOM",
			severity: "error",
			entityId: ownerId,
			field: slotId,
			message: `${slotId} at (${point.x},${point.z}) leaves room 0..${room.widthMm} x 0..${room.depthMm}`
		});
		for (const other of physical) if (pointInRectInclusive(point.x, point.z, other.rect)) issues.push({
			code: coverCode,
			severity: "error",
			entityId: ownerId,
			relatedEntityId: other.id,
			field: slotId,
			message: `${slotId} at (${point.x},${point.z}) lies inside physical rect ${other.id} (point-in-rect proven)`
		});
		for (const unit of navigableFor) if (!nav.isStaticNavigable({
			x: point.x,
			z: point.z
		}, unit.id)) issues.push({
			code: "SLOT_UNNAVIGABLE",
			severity: "error",
			entityId: ownerId,
			field: slotId,
			message: `${slotId} at (${point.x},${point.z}) is not statically navigable for ${unit.role} ${unit.id} (its footprint radius clears no position there)`
		});
	};
	for (const resource of scenario.resources) {
		const profiles = resource.kind === "packing" ? pickers : resource.kind === "receiving" ? putaways : [];
		for (const slot of [...resource.servicePositions, ...resource.queueSlots]) checkPoint(resource.id, slot.id, slot, profiles, "CLEARANCE_VIOLATION");
	}
	for (const location of scenario.locations) {
		const anchor = location.storageAnchorMm;
		if (anchor.x < 0 || anchor.z < 0 || anchor.x > room.widthMm || anchor.z > room.depthMm) issues.push({
			code: "OUT_OF_ROOM",
			severity: "error",
			entityId: location.id,
			relatedEntityId: location.rackId,
			field: "storageAnchorMm",
			message: `storage anchor ${location.id} leaves room`
		});
		checkPoint(location.id, `${location.id}:approach`, location.approachPointMm, scenario.mobileUnits, "CLEARANCE_VIOLATION");
	}
	for (const unit of scenario.mobileUnits) checkPoint(unit.id, `${unit.id}:parking`, unit.parkingSlotMm, [unit], "CLEARANCE_VIOLATION");
	if (pickers.length === 0 && scenario.resources.some((r) => r.kind === "packing")) issues.push({
		code: "NO_ELIGIBLE_AGENT",
		severity: "error",
		entityId: null,
		message: "scenario has packing resources but no picker eligible to serve them"
	});
	if (putaways.length === 0 && scenario.resources.some((r) => r.kind === "receiving")) issues.push({
		code: "NO_ELIGIBLE_AGENT",
		severity: "error",
		entityId: null,
		message: "scenario has receiving resources but no putaway unit eligible to serve it"
	});
	const addRoute = (entityId, fromLabel, from, toLabel, to, unitId) => {
		const route = nav.findStaticRoute({ ...from }, { ...to }, unitId);
		routes.push({
			fromLabel,
			toLabel,
			status: route.status,
			totalDistanceMm: route.status === "ok" ? route.totalDistanceMm : null,
			reason: route.status === "rejected" ? route.reason : null
		});
		if (route.status === "rejected") issues.push({
			code: "ROUTE_UNREACHABLE",
			severity: "error",
			entityId,
			field: `${fromLabel}->${toLabel}`,
			message: `no static route from ${fromLabel} (${from.x},${from.z}) to ${toLabel} (${to.x},${to.z}) for unit ${unitId}: ${route.reason}`
		});
	};
	const packingResources = scenario.resources.filter((r) => r.kind === "packing");
	const receivingResources = scenario.resources.filter((r) => r.kind === "receiving");
	for (const picker of pickers) {
		for (const location of scenario.locations) addRoute(location.id, `${picker.id}:parking`, picker.parkingSlotMm, `${location.id}:approach`, location.approachPointMm, picker.id);
		for (const resource of packingResources) for (const slot of [...resource.servicePositions, ...resource.queueSlots]) addRoute(resource.id, `${picker.id}:parking`, picker.parkingSlotMm, `${resource.id}:${slot.id}`, slot, picker.id);
	}
	for (const putaway of putaways) for (const resource of receivingResources) {
		for (const slot of [...resource.servicePositions, ...resource.queueSlots]) addRoute(resource.id, `${putaway.id}:parking`, putaway.parkingSlotMm, `${resource.id}:${slot.id}`, slot, putaway.id);
		for (const service of resource.servicePositions) for (const location of scenario.locations) addRoute(location.id, `${putaway.id}@${resource.id}:${service.id}`, service, `${location.id}:approach`, location.approachPointMm, putaway.id);
	}
	return {
		issues,
		routes
	};
}
async function validateLayoutCandidate(input) {
	const baseline = parseOperationsScenario(structuredClone(input.baselineScenario));
	const baselineGeo = geometryAccessIssuesFor(baseline);
	const finish = (structural, candidate, candidateGeo) => {
		const baselineIssues = [...baselineGeo.issues];
		const candidateIssues = candidateGeo ? [...candidateGeo.issues] : [];
		if (input.executionConfig) {
			const config = parseOperationsExecutionConfig(structuredClone(input.executionConfig));
			try {
				createOperationsController({
					scenario: structuredClone(baseline),
					executionConfig: config
				});
			} catch (error) {
				baselineIssues.push({
					code: "ENGINE_ADMISSION_FAILED",
					severity: "error",
					entityId: null,
					field: "baseline",
					message: `baseline rejected by operations controller: ${error instanceof Error ? error.message : "admission failed"}`
				});
			}
			if (candidate) try {
				createOperationsController({
					scenario: structuredClone(candidate),
					executionConfig: config
				});
			} catch (error) {
				candidateIssues.push({
					code: "ENGINE_ADMISSION_FAILED",
					severity: "error",
					entityId: null,
					field: "candidate",
					message: `candidate rejected by operations controller: ${error instanceof Error ? error.message : "admission failed"}`
				});
			}
		}
		const baseKeys = new Set(baselineIssues.map(issueKey));
		const candKeys = new Set(candidateIssues.map(issueKey));
		const introducedIssues = candidateIssues.filter((i) => !baseKeys.has(issueKey(i))).map((i) => ({
			...i,
			introduced: true
		}));
		const introducedKeys = new Set(introducedIssues.map(issueKey));
		for (const candidateIssue of candidateIssues) candidateIssue.introduced = introducedKeys.has(issueKey(candidateIssue));
		const repairedIssues = baselineIssues.filter((i) => !candKeys.has(issueKey(i)));
		const issues = [...structural, ...candidateIssues];
		const candidateValid = structural.length === 0 && candidateIssues.length === 0;
		return {
			ok: candidateValid,
			baselineValid: baselineIssues.length === 0,
			candidateValid,
			issues,
			baselineIssues,
			candidateIssues,
			introducedIssues,
			repairedIssues,
			candidateOnlyIssues: introducedIssues,
			routes: candidateGeo?.routes ?? []
		};
	};
	const parsed = parseLayoutProposal(input.proposal);
	if (!parsed.ok) return finish(parsed.issues, null, null);
	if (!parsed.supported) return finish([{
		code: "UNSUPPORTED_TRANSFORM",
		severity: "error",
		entityId: parsed.proposal.entityId || null,
		field: "kind",
		message: `transform kind ${parsed.proposal.kind} is explicitly unsupported in L0 (forward-compatible contract only; not silently ignored)`
	}], null, null);
	const proposal = parsed.proposal;
	const approvedParsed = parseApprovedConstraints(input.approvedConstraints);
	if (!approvedParsed.ok) return finish(approvedParsed.issues, null, null);
	const approved = approvedParsed.constraints;
	const structural = [];
	structural.push(...await validateProposalAgainstBaseline(proposal, baseline, new Set(input.attachments.keys()), approved));
	const attachment = input.attachments.get(proposal.entityId);
	if (attachment && (attachment.stationId !== proposal.entityId || attachment.resourceId !== proposal.entityId)) structural.push({
		code: "OWNERSHIP_MISMATCH",
		severity: "error",
		entityId: proposal.entityId,
		message: `attachment for ${proposal.entityId} names station ${attachment.stationId} / resource ${attachment.resourceId}; aliases cannot move another station`
	});
	let candidate = null;
	if (attachment && attachment.stationId === proposal.entityId && attachment.resourceId === proposal.entityId) {
		structural.push(...validateResolvedTransform(proposal, attachment.centreMm, approved).issues);
		try {
			const bundle = applyPackingStationTranslation(baseline, proposal, input.attachments);
			candidate = input.candidateScenario ? parseOperationsScenario(structuredClone(input.candidateScenario)) : bundle.scenario;
			if (input.candidateScenario) {
				const paths = /* @__PURE__ */ new Set([...diffPaths(baseline, candidate), ...diffPaths(baseline, bundle.scenario)]);
				for (const path of paths) {
					const candidateValue = getAtJsonPath(candidate, path);
					const reconstructedValue = getAtJsonPath(bundle.scenario, path);
					if (canonicalStringify(candidateValue) !== canonicalStringify(reconstructedValue)) structural.push({
						code: "CANDIDATE_VALUE_MISMATCH",
						severity: "error",
						entityId: proposal.entityId,
						field: path,
						message: `candidate value at ${path} is ${canonicalStringify(candidateValue)} but baseline + proposal rigid translation requires ${canonicalStringify(reconstructedValue)} (attached offsets must remain exact)`
					});
					if (!isAllowedLayoutPath(path, baseline, attachment) && canonicalStringify(getAtJsonPath(baseline, path)) !== canonicalStringify(candidateValue)) structural.push({
						code: "EXOGENOUS_CHANGE",
						severity: "error",
						entityId: proposal.entityId,
						field: path,
						message: `candidate changes ${path}, which is outside the moved station's attached coordinates (matched worker count/service/workload/seed/geometry is required)`
					});
				}
			}
		} catch (error) {
			structural.push({
				code: "CANONICAL_SCENARIO_INVALID",
				severity: "error",
				entityId: proposal.entityId,
				message: `candidate scenario rejected by canonical parser: ${error instanceof Error ? error.message : "invalid scenario"}`
			});
			candidate = null;
		}
	}
	const candidateGeo = candidate ? geometryAccessIssuesFor(candidate) : null;
	return finish(structural, candidate, candidateGeo);
}
// packages/simulation/src/layout/compare.ts
var DECISION_CRITERION = "Pareto over available fields: shipped (higher better), makespanMs (lower better, complete cohorts only), lastShippedAtMs (lower better, within-window timing only, never a completion claim), totalWaitMs (lower better), backlog (lower better). Better somewhere and worse nowhere = improved; the mirror = worse; both directions = mixed; all equal = no-improvement.";
function classifyImprovement(baseline, candidate) {
	const signs = [];
	const push = (candidateValue, baselineValue, higherIsBetter) => {
		if (candidateValue === baselineValue) return;
		signs.push(candidateValue > baselineValue === higherIsBetter ? 1 : -1);
	};
	push(candidate.shipped, baseline.shipped, true);
	if (baseline.makespanMs !== null && candidate.makespanMs !== null) push(candidate.makespanMs, baseline.makespanMs, false);
	if (baseline.lastShippedAtMs !== null && candidate.lastShippedAtMs !== null) push(candidate.lastShippedAtMs, baseline.lastShippedAtMs, false);
	push(candidate.totalWaitMs, baseline.totalWaitMs, false);
	push(candidate.backlog, baseline.backlog, false);
	if (signs.length === 0) return "no-improvement";
	if (signs.every((s) => s > 0)) return "improved";
	if (signs.every((s) => s < 0)) return "worse";
	return "mixed";
}
function runOne(scenario, config, ceiling) {
	const controller = createOperationsController({
		scenario: structuredClone(scenario),
		executionConfig: structuredClone(config)
	});
	const termination = runOperationsToTermination(controller, ceiling);
	const report = controller.exportReport();
	const snapshot = controller.snapshot();
	const metrics = operationsRunMetrics(snapshot, report.completionStage);
	return {
		report: {
			...report,
			clockMs: snapshot.clockMs,
			termination,
			totalWaitMs: metrics.totalWaitMs,
			makespanMs: metrics.makespanMs,
			lastShippedAtMs: metrics.lastShippedAtMs
		},
		termination,
		metrics: {
			completionStage: report.completionStage,
			shipped: report.counts.shipped,
			backlog: report.counts.backlog,
			stageBacklog: report.counts.stageBacklog,
			totalWaitMs: metrics.totalWaitMs,
			makespanMs: metrics.makespanMs,
			lastShippedAtMs: metrics.lastShippedAtMs,
			stopClockMs: termination.stopClockMs
		}
	};
}
function scopeFor(baseline, ceiling, baselineTerm, candidateTerm) {
	const run = baseline.policies.run;
	const horizonMs = run.mode === "fixed-window" ? run.horizonMs : null;
	const truncated = [baselineTerm, candidateTerm].some((t) => t !== null && (t.stopReason === "safety-ceiling" || horizonMs !== null && t.stopClockMs < horizonMs));
	return {
		runMode: run.mode,
		horizonMs,
		arrivalCutoffMs: run.mode === "finite-cohort" ? run.arrivalCutoffMs : null,
		safetyCeilingMs: ceiling,
		ordersInScenario: baseline.orderSchedule.length,
		baselineStopReason: baselineTerm?.stopReason ?? null,
		candidateStopReason: candidateTerm?.stopReason ?? null,
		truncated,
		fullHorizonEvaluated: !truncated
	};
}
function explain(measurement, scope, baseline, candidate, improvement) {
	const scopeText = scope.truncated ? `Evaluation is truncated: runs stopped before the full ${scope.horizonMs !== null ? `${scope.horizonMs}ms fixed-window horizon` : "cohort"} (safety ceiling ${scope.safetyCeilingMs}ms); only orders shipped inside the evaluated window are counted (${candidate?.shipped ?? 0} candidate / ${baseline?.shipped ?? 0} baseline of ${scope.ordersInScenario} scheduled), which is not a full-cohort completion.` : "The full declared horizon/cohort was evaluated.";
	if (measurement === "not-measured") return `No measured performance: the candidate is not valid, so no engine outcome is claimed. ${scopeText}`;
	if (measurement === "candidate-only-repaired") return `The baseline is invalid and has no fabricated valid measurement; the candidate repairs the baseline errors and is shown as a candidate-only preview with no delta or improvement claim. ${scopeText}`;
	return `Measured under identical exogenous inputs. Decision: ${improvement} under the declared criterion. Baseline shipped ${baseline?.shipped}, candidate shipped ${candidate?.shipped}; makespan ${baseline?.makespanMs ?? "n/a (incomplete cohort)"} -> ${candidate?.makespanMs ?? "n/a (incomplete cohort)"}; last shipped within window ${baseline?.lastShippedAtMs ?? "n/a"} -> ${candidate?.lastShippedAtMs ?? "n/a"} (timing only, not completion); total wait ${baseline?.totalWaitMs} -> ${candidate?.totalWaitMs}. ${scopeText}`;
}
async function runLayoutComparison(input) {
	if (input.implementationVersion !== void 0 && input.implementationVersion !== "0.1.1") throw new Error(`Layout editing supports current implementation ${SIMULATION_VERSION} only; recorded ${input.implementationVersion} remains read-only.`);
	const baseline = parseOperationsScenario(structuredClone(input.baselineScenario));
	const executionConfig = parseOperationsExecutionConfig(structuredClone(input.executionConfig));
	const ceiling = input.safetyCeilingMs ?? 72e5;
	if (!Number.isSafeInteger(ceiling) || ceiling < 1 || ceiling > 2147483647) throw new Error("safetyCeilingMs must be an integer in 1..2147483647");
	const approvedParsed = parseApprovedConstraints(input.approvedConstraints);
	const attachments = buildStationAttachmentMap(baseline, input.attachments);
	const validation = await validateLayoutCandidate({
		baselineScenario: baseline,
		proposal: input.proposal,
		attachments,
		approvedConstraints: input.approvedConstraints,
		executionConfig
	});
	const parsed = parseLayoutProposal(input.proposal);
	let bundle = null;
	if (parsed.ok && parsed.supported && attachments.has(parsed.proposal.entityId)) try {
		bundle = applyPackingStationTranslation(baseline, parsed.proposal, attachments);
	} catch {
		bundle = null;
	}
	const candidate = bundle?.scenario ?? null;
	const approvedConstraints = approvedParsed.ok ? approvedParsed.constraints : {
		allowedEntityIds: [],
		lockedEntityIds: [],
		maxMovedEntities: 0,
		maxTranslationMm: 0,
		snapGridMm: 1,
		requireSameWorkerCount: true,
		requireSameServiceDurations: true,
		requireSameWorkload: true,
		requireSameSeed: true
	};
	const base = {
		schema: LAYOUT_COMPARISON_SCHEMA,
		layoutDraftVersion: LAYOUT_DRAFT_VERSION,
		versions: {
			simulation: SIMULATION_VERSION,
			operationsSchema: OPERATIONS_SCHEMA_VERSION,
			operationsEngine: OPERATIONS_ENGINE_VERSION
		},
		proposal: structuredClone(input.proposal),
		approvedConstraints: structuredClone(approvedConstraints),
		approvedConstraintsSha256: await contentSha256(approvedConstraints),
		commonInputs: {
			scenario: structuredClone(baseline),
			executionConfig: structuredClone(executionConfig)
		},
		attachments: structuredClone(input.attachments),
		terminationPolicy: { safetyCeilingMs: ceiling },
		parentIdentity: {
			scenarioId: baseline.id,
			scenarioContentSha256: await contentSha256(baseline)
		},
		executionConfigSha256: await contentSha256(executionConfig),
		decisionCriterion: DECISION_CRITERION,
		assumptions: [
			"synthetic scenario inputs are constructed test inputs, not calibrated measurements",
			"baseline and candidate share identical orders, deliveries, initial stock, seed, worker profiles/count, service durations and execution config; only the moved station's attached coordinates differ",
			"an invalid candidate returns no measured performance; worse, mixed and no-improvement candidates are retained honestly"
		]
	};
	const bundleFields = {
		candidateIdentity: candidate ? { scenarioContentSha256: await contentSha256(candidate) } : null,
		transform: bundle ? structuredClone(bundle.transform) : null,
		attachmentsBefore: bundle ? structuredClone(bundle.attachmentsBefore) : null,
		attachmentsAfter: bundle ? structuredClone(bundle.attachmentsAfter) : null,
		viewerPlacement: bundle ? structuredClone(bundle.viewerPlacement) : null,
		changedFields: bundle ? [...bundle.changedFields] : [],
		candidateScenario: candidate ? structuredClone(candidate) : null,
		validation,
		baselineValid: validation.baselineValid,
		candidateValid: validation.candidateValid
	};
	if (!validation.candidateValid || !candidate) {
		const scope = scopeFor(baseline, ceiling, null, null);
		return {
			...base,
			...bundleFields,
			measurement: "not-measured",
			evaluationScope: scope,
			explanation: explain("not-measured", scope, null, null, "not-measured"),
			baselineReport: null,
			candidateReport: null,
			baselineMetrics: null,
			candidateMetrics: null,
			baselineTermination: null,
			candidateTermination: null,
			delta: null,
			improvement: "not-measured"
		};
	}
	if (!validation.baselineValid) {
		const candidateRun = runOne(candidate, executionConfig, ceiling);
		const scope = scopeFor(baseline, ceiling, null, candidateRun.termination);
		return {
			...base,
			...bundleFields,
			measurement: "candidate-only-repaired",
			evaluationScope: scope,
			explanation: explain("candidate-only-repaired", scope, null, candidateRun.metrics, "not-measured"),
			baselineReport: null,
			candidateReport: candidateRun.report,
			baselineMetrics: null,
			candidateMetrics: candidateRun.metrics,
			baselineTermination: null,
			candidateTermination: candidateRun.termination,
			delta: null,
			improvement: "not-measured"
		};
	}
	const baselineRun = runOne(baseline, executionConfig, ceiling);
	const candidateRun = runOne(candidate, executionConfig, ceiling);
	const delta = {
		shipped: candidateRun.metrics.shipped - baselineRun.metrics.shipped,
		backlog: candidateRun.metrics.backlog - baselineRun.metrics.backlog,
		stageBacklog: candidateRun.metrics.stageBacklog - baselineRun.metrics.stageBacklog,
		totalWaitMs: candidateRun.metrics.totalWaitMs - baselineRun.metrics.totalWaitMs,
		makespanMs: baselineRun.metrics.makespanMs !== null && candidateRun.metrics.makespanMs !== null ? candidateRun.metrics.makespanMs - baselineRun.metrics.makespanMs : null,
		lastShippedAtMs: baselineRun.metrics.lastShippedAtMs !== null && candidateRun.metrics.lastShippedAtMs !== null ? candidateRun.metrics.lastShippedAtMs - baselineRun.metrics.lastShippedAtMs : null,
		stopClockMs: candidateRun.metrics.stopClockMs - baselineRun.metrics.stopClockMs
	};
	const improvement = classifyImprovement(baselineRun.metrics, candidateRun.metrics);
	const scope = scopeFor(baseline, ceiling, baselineRun.termination, candidateRun.termination);
	return {
		...base,
		...bundleFields,
		measurement: "measured",
		evaluationScope: scope,
		explanation: explain("measured", scope, baselineRun.metrics, candidateRun.metrics, improvement),
		baselineReport: baselineRun.report,
		candidateReport: candidateRun.report,
		baselineMetrics: baselineRun.metrics,
		candidateMetrics: candidateRun.metrics,
		baselineTermination: baselineRun.termination,
		candidateTermination: candidateRun.termination,
		delta,
		improvement
	};
}
var REQUIRED_FIELDS = [
	"schema",
	"layoutDraftVersion",
	"versions",
	"proposal",
	"approvedConstraints",
	"approvedConstraintsSha256",
	"commonInputs",
	"attachments",
	"terminationPolicy",
	"parentIdentity",
	"candidateIdentity",
	"executionConfigSha256",
	"transform",
	"attachmentsBefore",
	"attachmentsAfter",
	"viewerPlacement",
	"changedFields",
	"candidateScenario",
	"validation",
	"baselineValid",
	"candidateValid",
	"measurement",
	"evaluationScope",
	"decisionCriterion",
	"explanation",
	"baselineReport",
	"candidateReport",
	"baselineMetrics",
	"candidateMetrics",
	"baselineTermination",
	"candidateTermination",
	"delta",
	"improvement",
	"assumptions"
];
async function verifyLayoutComparison(exported) {
	const mismatches = [];
	const none = {
		kind: null,
		recomputedImprovement: null,
		recomputedCandidateSha256: null
	};
	if (typeof exported !== "object" || exported === null) return {
		ok: false,
		mismatches: ["layout comparison export must be an object"],
		...none
	};
	const exp = exported;
	for (const field of REQUIRED_FIELDS) if (!(field in exp) || exp[field] === void 0) mismatches.push(`missing declared field: ${field}`);
	if (mismatches.length > 0) return {
		ok: false,
		mismatches,
		...none
	};
	if (exp.schema !== "layoutlab.layout-comparison/2") mismatches.push(`unsupported layout comparison schema ${String(exp.schema)} (legacy exports lack the revision-2 envelope and are not fully verifiable)`);
	if (exp.layoutDraftVersion !== "layoutlab.layout-draft/2") mismatches.push(`layoutDraftVersion: saved ${String(exp.layoutDraftVersion)} != current ${LAYOUT_DRAFT_VERSION}`);
	const wantVersions = {
		simulation: SIMULATION_VERSION,
		operationsSchema: OPERATIONS_SCHEMA_VERSION,
		operationsEngine: OPERATIONS_ENGINE_VERSION
	};
	if (canonicalStringify(exp.versions) !== canonicalStringify(wantVersions)) mismatches.push(`versions: saved ${canonicalStringify(exp.versions)} != current ${canonicalStringify(wantVersions)}`);
	if (exp.decisionCriterion !== "Pareto over available fields: shipped (higher better), makespanMs (lower better, complete cohorts only), lastShippedAtMs (lower better, within-window timing only, never a completion claim), totalWaitMs (lower better), backlog (lower better). Better somewhere and worse nowhere = improved; the mirror = worse; both directions = mixed; all equal = no-improvement.") mismatches.push("decisionCriterion: saved criterion differs from the declared criterion");
	const approvedParsed = parseApprovedConstraints(exp.approvedConstraints);
	if (!approvedParsed.ok) {
		for (const iss of approvedParsed.issues) mismatches.push(`approvedConstraints: ${iss.message}`);
		return {
			ok: false,
			mismatches,
			...none
		};
	}
	if (exp.approvedConstraintsSha256 !== await contentSha256(exp.approvedConstraints)) mismatches.push("approvedConstraintsSha256: saved hash != recomputed approved-constraints hash");
	const parsedProposal = parseLayoutProposal(exp.proposal);
	if ((!parsedProposal.ok || !parsedProposal.supported) && exp.measurement !== "not-measured") mismatches.push("proposal is structurally invalid/unsupported but the export does not record a not-measured rejection");
	let baseline;
	let executionConfig;
	try {
		baseline = parseOperationsScenario(structuredClone(exp.commonInputs?.scenario));
		executionConfig = parseOperationsExecutionConfig(structuredClone(exp.commonInputs?.executionConfig));
	} catch (error) {
		return {
			ok: false,
			mismatches: [...mismatches, `common inputs: ${error instanceof Error ? error.message : "invalid"}`],
			...none
		};
	}
	if (exp.parentIdentity?.scenarioId !== baseline.id) mismatches.push(`parentIdentity.scenarioId: saved ${String(exp.parentIdentity?.scenarioId)} != scenario ${baseline.id}`);
	if (exp.parentIdentity?.scenarioContentSha256 !== await contentSha256(baseline)) mismatches.push("parentIdentity.scenarioContentSha256: saved hash != recomputed baseline content hash");
	if (exp.executionConfigSha256 !== await contentSha256(executionConfig)) mismatches.push("executionConfigSha256: saved hash != recomputed execution config hash");
	const ceiling = exp.terminationPolicy?.safetyCeilingMs;
	if (typeof ceiling !== "number" || !Number.isSafeInteger(ceiling) || ceiling < 1 || ceiling > 2147483647) return {
		ok: false,
		mismatches: [...mismatches, "terminationPolicy.safetyCeilingMs: missing or invalid; verifier does not invent it"],
		...none
	};
	if (exp.measurement === "measured" && (!exp.baselineReport || !exp.candidateReport || !exp.baselineMetrics || !exp.candidateMetrics || !exp.delta)) mismatches.push("measurement is 'measured' but reports/metrics/delta are missing");
	if (exp.measurement === "candidate-only-repaired" && (exp.baselineReport !== null || !exp.candidateReport || exp.delta !== null || exp.improvement !== "not-measured")) mismatches.push("measurement is 'candidate-only-repaired' but baseline evidence, delta or improvement label is fabricated");
	if (exp.measurement === "not-measured" && (exp.baselineReport !== null || exp.candidateReport !== null || exp.delta !== null || exp.improvement !== "not-measured")) mismatches.push("measurement is 'not-measured' but reports/delta/improvement claim measured performance");
	let rerun;
	try {
		rerun = await runLayoutComparison({
			baselineScenario: baseline,
			executionConfig,
			proposal: structuredClone(exp.proposal),
			attachments: structuredClone(exp.attachments ?? []),
			approvedConstraints: structuredClone(exp.approvedConstraints),
			safetyCeilingMs: ceiling
		});
	} catch (error) {
		return {
			ok: false,
			mismatches: [...mismatches, `rerun: ${error instanceof Error ? error.message : "rerun failed"}`],
			...none
		};
	}
	const compareField = (label, saved, fresh) => {
		if (canonicalStringify(saved) !== canonicalStringify(fresh)) mismatches.push(`${label}: saved value differs from recomputed value`);
	};
	compareField("versions", exp.versions, rerun.versions);
	compareField("approvedConstraints", exp.approvedConstraints, rerun.approvedConstraints);
	compareField("candidateScenario", exp.candidateScenario, rerun.candidateScenario);
	compareField("transform", exp.transform, rerun.transform);
	compareField("attachmentsBefore", exp.attachmentsBefore, rerun.attachmentsBefore);
	compareField("attachmentsAfter", exp.attachmentsAfter, rerun.attachmentsAfter);
	compareField("viewerPlacement", exp.viewerPlacement, rerun.viewerPlacement);
	compareField("changedFields", exp.changedFields, rerun.changedFields);
	compareField("validation", exp.validation, rerun.validation);
	compareField("baselineValid/candidateValid", [exp.baselineValid, exp.candidateValid], [rerun.baselineValid, rerun.candidateValid]);
	compareField("measurement", exp.measurement, rerun.measurement);
	compareField("evaluationScope", exp.evaluationScope, rerun.evaluationScope);
	compareField("explanation", exp.explanation, rerun.explanation);
	compareField("baselineReport", exp.baselineReport, rerun.baselineReport);
	compareField("candidateReport", exp.candidateReport, rerun.candidateReport);
	compareField("baselineMetrics", exp.baselineMetrics, rerun.baselineMetrics);
	compareField("candidateMetrics", exp.candidateMetrics, rerun.candidateMetrics);
	compareField("baselineTermination", exp.baselineTermination, rerun.baselineTermination);
	compareField("candidateTermination", exp.candidateTermination, rerun.candidateTermination);
	compareField("delta", exp.delta, rerun.delta);
	if (exp.improvement !== rerun.improvement) mismatches.push(`improvement: saved ${String(exp.improvement)} != recomputed ${rerun.improvement}`);
	if (canonicalStringify(exp.candidateIdentity) !== canonicalStringify(rerun.candidateIdentity)) mismatches.push("candidateIdentity: saved candidate hash differs from reconstruction");
	if (exp.candidateScenario && rerun.candidateScenario && canonicalStringify(exp.candidateScenario) !== canonicalStringify(rerun.candidateScenario)) {
		const tampered = diffPaths(rerun.candidateScenario, exp.candidateScenario).slice(0, 8);
		mismatches.push(`candidateScenario reconstruction drift at: ${tampered.join(", ")}`);
	}
	for (const [label, report] of [["baselineReport", exp.baselineReport], ["candidateReport", exp.candidateReport]]) {
		if (!report) continue;
		const recomputed = recomputeOperationsReport(report);
		for (const mismatch of recomputed.mismatches) mismatches.push(`${label}: ${mismatch}`);
	}
	return {
		ok: mismatches.length === 0,
		mismatches,
		kind: rerun.measurement === "measured" ? "measured" : rerun.measurement === "candidate-only-repaired" ? "candidate-only-repaired" : "rejection",
		recomputedImprovement: rerun.improvement,
		recomputedCandidateSha256: rerun.candidateIdentity?.scenarioContentSha256 ?? null
	};
}
// packages/simulation/src/layout/corridor.ts
var CORRIDOR_EXECUTION_CONFIG = {
	pickDurationMsPerItem: 2e3,
	unloadDurationMsPerItem: 1e3
};
var CORRIDOR_BASE_CENTRE_X = 8e3;
function buildCorridorScenario(packCentreX = CORRIDOR_BASE_CENTRE_X) {
	return {
		schemaVersion: "layoutlab.operations/1",
		engineVersion: "layoutlab.operations-engine/1",
		id: "l0-corridor-1",
		provenance: {
			category: "synthetic",
			description: "L0 one-order corridor oracle; synthetic, uncalibrated.",
			sourceUrls: [],
			assumptions: ["synthetic corridor for hand-derived timing only"],
			inventedFields: ["all coordinates, capacities, and schedules"]
		},
		seed: "l0-corridor-001",
		units: {
			quantityUnit: "item",
			capacityUnit: "handling-unit"
		},
		geometry: {
			room: {
				widthMm: 14e3,
				depthMm: 6e3
			},
			racks: [{
				id: "R1",
				positionMm: {
					x: 3e3,
					z: 1500
				},
				dimensionsMm: {
					width: 2e3,
					depth: 1e3,
					height: 2e3
				}
			}],
			obstacles: [{
				id: "OB-PACK1",
				minXMm: packCentreX - 934,
				minZMm: 490,
				maxXMm: packCentreX + 934,
				maxZMm: 1710
			}]
		},
		products: [{
			id: "P-A",
			label: "Widget",
			itemDimensionsMm: {
				width: 200,
				depth: 200,
				height: 200
			},
			handlingClass: "ambient",
			capacityCostUnits: 1
		}],
		locations: [{
			id: "L-A1",
			rackId: "R1",
			storageAnchorMm: {
				x: 3e3,
				y: 450,
				z: 1500
			},
			approachPointMm: {
				x: 3e3,
				z: 3e3
			},
			usableDimensionsMm: {
				width: 500,
				depth: 400,
				height: 400
			},
			storageClass: "ambient",
			maxQuantity: 100,
			restrictions: { eligibleHandlingClasses: ["ambient"] }
		}],
		initialStock: [{
			locationId: "L-A1",
			productId: "P-A",
			quantity: 10
		}],
		mobileUnits: [{
			id: "PK-1",
			role: "picker",
			footprintMm: {
				width: 680,
				length: 1220,
				margin: 100
			},
			speedMmPerSecond: 1e3,
			loadCapacityUnits: 10,
			eligibleHandlingClasses: ["ambient"],
			parkingSlotMm: {
				x: 1e3,
				z: 3e3
			}
		}],
		resources: [{
			id: "PACK-1",
			kind: "packing",
			servicePositions: [{
				id: "PACK1-S1",
				x: packCentreX,
				z: 3e3
			}],
			queueSlots: [{
				id: "PACK1-Q1",
				x: packCentreX - 2e3,
				z: 3e3
			}],
			serviceCapacity: 1,
			inputStagingCapacity: 10,
			outputStagingCapacity: 10,
			serviceDurationMs: 1e4
		}, {
			id: "DSP-1",
			kind: "dispatch",
			servicePositions: [{
				id: "DSP-S1",
				x: 12e3,
				z: 3e3
			}],
			queueSlots: [{
				id: "DSP-Q1",
				x: 11e3,
				z: 3e3
			}],
			serviceCapacity: 1,
			inputStagingCapacity: 10,
			outputStagingCapacity: 10,
			serviceDurationMs: 5e3
		}],
		orderSchedule: [{
			id: "O-1",
			arrivalTimeMs: 0,
			lines: [{
				productId: "P-A",
				quantity: 2
			}]
		}],
		deliverySchedule: [],
		policies: {
			reservePolicy: "full-order-all-or-none",
			run: {
				mode: "finite-cohort",
				arrivalCutoffMs: 0
			},
			eventLimits: {
				maxProcessedEvents: 1e5,
				maxEventsPerTimestamp: 1e4
			}
		}
	};
}
function corridorAttachment(packCentreX = CORRIDOR_BASE_CENTRE_X) {
	return {
		stationId: "PACK-1",
		resourceId: "PACK-1",
		obstacleId: "OB-PACK1",
		assetRef: "warehouse-environment/table_packing_heavyduty_c01",
		centreMm: {
			x: packCentreX,
			z: 1100
		},
		obstacleRectMm: {
			minXMm: packCentreX - 934,
			minZMm: 490,
			maxXMm: packCentreX + 934,
			maxZMm: 1710
		},
		servicePositions: [{
			id: "PACK1-S1",
			x: packCentreX,
			z: 3e3
		}],
		queueSlots: [{
			id: "PACK1-Q1",
			x: packCentreX - 2e3,
			z: 3e3
		}]
	};
}
// packages/simulation/src/layout/rack.ts
function buildRackAttachmentMap(scenario) {
	const s = parseOperationsScenario(structuredClone(scenario));
	return new Map(s.geometry.racks.map((r) => [r.id, {
		rackId: r.id,
		rack: structuredClone(r),
		slots: structuredClone(s.locations.filter((l) => l.rackId === r.id))
	}]));
}
function stationShape$1(proposal) {
	return {
		...proposal,
		kind: "PACKING_STATION_TRANSLATION"
	};
}
function parseRackProposal(raw) {
	if (typeof raw !== "object" || raw === null || raw.kind !== "RACK_TRANSLATION") throw new Error("Expected RACK_TRANSLATION");
	const parsed = parseLayoutProposal({
		...raw,
		kind: "PACKING_STATION_TRANSLATION"
	});
	if (!parsed.ok || !parsed.supported) throw new Error("Invalid rack proposal");
	return {
		...parsed.proposal,
		kind: "RACK_TRANSLATION"
	};
}
function applyRackTranslation(baselineRaw, raw, attachments) {
	const baseline = parseOperationsScenario(structuredClone(baselineRaw));
	const proposal = parseRackProposal(raw);
	const attachment = structuredClone(attachments.get(proposal.entityId));
	const expected = buildRackAttachmentMap(baseline).get(proposal.entityId);
	if (!attachment || !expected || canonicalStringify(attachment) !== canonicalStringify(expected)) throw new Error(`OWNERSHIP_MISMATCH: ${proposal.entityId} rack/owned slots differ from canonical exact rackId map`);
	const { centreMm, deltaMm } = resolveTargetCentre(stationShape$1(proposal), attachment.rack.positionMm);
	const candidate = structuredClone(baseline);
	const rack = candidate.geometry.racks.find((r) => r.id === proposal.entityId);
	rack.positionMm = centreMm;
	for (const slot of candidate.locations.filter((l) => l.rackId === proposal.entityId)) {
		slot.storageAnchorMm.x += deltaMm.dx;
		slot.storageAnchorMm.z += deltaMm.dz;
		slot.approachPointMm.x += deltaMm.dx;
		slot.approachPointMm.z += deltaMm.dz;
	}
	const scenario = parseOperationsScenario(candidate);
	return {
		scenario,
		transform: {
			entityId: proposal.entityId,
			fromCentreMm: attachment.rack.positionMm,
			toCentreMm: centreMm,
			deltaMm
		},
		attachmentsBefore: structuredClone(attachment),
		viewerPlacement: buildRackAttachmentMap(scenario).get(proposal.entityId),
		changedFields: diffPaths(baseline, scenario)
	};
}
async function runRackLayoutComparison(input) {
	input = structuredClone(input);
	const baseline = parseOperationsScenario(structuredClone(input.baselineScenario));
	const proposal = parseRackProposal(input.proposal);
	const approved = parseApprovedConstraints(input.approvedConstraints);
	if (!approved.ok) throw new Error("Invalid approved constraints");
	const config = parseOperationsExecutionConfig(structuredClone(input.executionConfig));
	if (!Number.isSafeInteger(input.safetyCeilingMs) || input.safetyCeilingMs <= 0) throw new Error("Invalid safety ceiling");
	const bundle = applyRackTranslation(baseline, proposal, input.attachments);
	const structural = await validateProposalAgainstBaseline(stationShape$1(proposal), baseline, new Set(input.attachments.keys()), approved.constraints);
	structural.push(...validateResolvedTransform(stationShape$1(proposal), bundle.attachmentsBefore.rack.positionMm, approved.constraints).issues);
	const base = geometryAccessIssuesFor(baseline);
	const candidate = geometryAccessIssuesFor(bundle.scenario);
	const admit = (scenario, issues) => {
		try {
			createOperationsController({
				scenario,
				executionConfig: config
			});
		} catch (e) {
			issues.push({
				code: "ENGINE_ADMISSION_FAILED",
				severity: "error",
				entityId: proposal.entityId,
				message: String(e)
			});
		}
	};
	admit(baseline, base.issues);
	admit(bundle.scenario, candidate.issues);
	const candidateValid = structural.length === 0 && candidate.issues.length === 0;
	const baselineRun = base.issues.length ? null : runOne(baseline, config, input.safetyCeilingMs);
	const candidateRun = candidateValid ? runOne(bundle.scenario, config, input.safetyCeilingMs) : null;
	const delta = baselineRun && candidateRun ? {
		shipped: candidateRun.metrics.shipped - baselineRun.metrics.shipped,
		backlog: candidateRun.metrics.backlog - baselineRun.metrics.backlog,
		stageBacklog: candidateRun.metrics.stageBacklog - baselineRun.metrics.stageBacklog,
		totalWaitMs: candidateRun.metrics.totalWaitMs - baselineRun.metrics.totalWaitMs,
		makespanMs: candidateRun.metrics.makespanMs !== null && baselineRun.metrics.makespanMs !== null ? candidateRun.metrics.makespanMs - baselineRun.metrics.makespanMs : null,
		lastShippedAtMs: candidateRun.metrics.lastShippedAtMs !== null && baselineRun.metrics.lastShippedAtMs !== null ? candidateRun.metrics.lastShippedAtMs - baselineRun.metrics.lastShippedAtMs : null,
		stopClockMs: candidateRun.metrics.stopClockMs - baselineRun.metrics.stopClockMs
	} : null;
	return {
		versions: {
			simulation: SIMULATION_VERSION,
			operationsSchema: OPERATIONS_SCHEMA_VERSION,
			operationsEngine: OPERATIONS_ENGINE_VERSION
		},
		evaluationScope: scopeFor(baseline, input.safetyCeilingMs, baselineRun?.termination ?? null, candidateRun?.termination ?? null),
		delta,
		improvement: baselineRun && candidateRun ? classifyImprovement(baselineRun.metrics, candidateRun.metrics) : "not-measured",
		schema: "layoutlab.rack-comparison/1",
		commonInputs: {
			scenario: baseline,
			executionConfig: config
		},
		proposal,
		approvedConstraints: approved.constraints,
		attachments: [...input.attachments.values()],
		safetyCeilingMs: input.safetyCeilingMs,
		parentHash: await contentSha256(baseline),
		bundle,
		validation: {
			baselineValid: base.issues.length === 0,
			candidateValid,
			structural,
			baseline: base,
			candidate
		},
		measurement: !candidateValid ? "not-measured" : base.issues.length ? "candidate-only-repaired" : "measured",
		baselineRun,
		candidateRun
	};
}
async function verifyRackLayoutComparison(report) {
	try {
		if (report.schema !== "layoutlab.rack-comparison/1" || canonicalStringify(report.versions) !== canonicalStringify({
			simulation: "0.1.1",
			operationsSchema: "layoutlab.operations/1",
			operationsEngine: "layoutlab.operations-engine/1"
		})) return false;
		report = structuredClone(report);
		return canonicalStringify(await runRackLayoutComparison({
			baselineScenario: report.commonInputs.scenario,
			proposal: report.proposal,
			approvedConstraints: report.approvedConstraints,
			attachments: new Map(report.attachments.map((a) => [a.rackId, a])),
			executionConfig: report.commonInputs.executionConfig,
			safetyCeilingMs: report.safetyCeilingMs
		})) === canonicalStringify(report);
	} catch {
		return false;
	}
}
// packages/simulation/src/layout/rack-rotation.ts
var versions = {
	simulation: SIMULATION_VERSION,
	operationsSchema: OPERATIONS_SCHEMA_VERSION,
	operationsEngine: OPERATIONS_ENGINE_VERSION
};
function exactKeys(value, keys) {
	if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((k) => !keys.includes(k)) || keys.some((k) => !(k in value))) throw new Error("SCHEMA_INVALID: exact rotation contract keys required");
}
function parseProposal(raw) {
	exactKeys(raw, [
		"kind",
		"proposalId",
		"parent",
		"entityId",
		"quarterTurns"
	]);
	if (raw.kind !== "RACK_QUARTER_TURN" || ![
		1,
		2,
		3
	].includes(raw.quarterTurns)) throw new Error("UNSUPPORTED_ROTATION: quarterTurns must be 1, 2 or 3; arbitrary angles unsupported");
	const { quarterTurns, ...rest } = raw;
	const parsed = parseLayoutProposal({
		...rest,
		kind: "PACKING_STATION_TRANSLATION",
		target: {
			mode: "DELTA_MM",
			deltaMm: {
				dx: 0,
				dz: 0
			}
		}
	});
	if (!parsed.ok || !parsed.supported) throw new Error("SCHEMA_INVALID: rotation identity");
	const { target: _target, kind: _kind, ...identity } = parsed.proposal;
	return {
		...identity,
		kind: "RACK_QUARTER_TURN",
		quarterTurns
	};
}
function parseAuthority(raw) {
	exactKeys(raw, [
		"allowedRackIds",
		"lockedRackIds",
		"allowedQuarterTurns",
		"maxRotatedRacks",
		"maxQuarterTurns"
	]);
	for (const key of ["allowedRackIds", "lockedRackIds"]) if (!Array.isArray(raw[key]) || raw[key].some((x) => typeof x !== "string") || new Set(raw[key]).size !== raw[key].length) throw new Error("SCHEMA_INVALID: rotation rack authority");
	if (!Array.isArray(raw.allowedQuarterTurns) || raw.allowedQuarterTurns.some((x) => ![
		1,
		2,
		3
	].includes(x)) || new Set(raw.allowedQuarterTurns).size !== raw.allowedQuarterTurns.length) throw new Error("SCHEMA_INVALID: allowed quarter turns");
	for (const key of ["maxRotatedRacks", "maxQuarterTurns"]) if (!Number.isSafeInteger(raw[key]) || raw[key] < 0) throw new Error("SCHEMA_INVALID: rotation budget");
	return structuredClone(raw);
}
/** Positive Three.js Y yaw: (dx,dz) -> (dz,-dx). Integer arithmetic only. */
function rotateRackOffset(point, turns) {
	if (!Number.isSafeInteger(turns)) throw new Error("Integer quarter turns required");
	let { x, z } = point;
	for (let i = 0; i < (turns % 4 + 4) % 4; i++) [x, z] = [z, -x];
	return {
		x: x === 0 ? 0 : x,
		z: z === 0 ? 0 : z
	};
}
function rotatedAttachment(original, center, turns) {
	const result = structuredClone(original);
	const from = original.rack.positionMm;
	result.rack.positionMm = { ...center };
	if (turns % 2) [result.rack.dimensionsMm.width, result.rack.dimensionsMm.depth] = [result.rack.dimensionsMm.depth, result.rack.dimensionsMm.width];
	const point = (p) => {
		const r = rotateRackOffset({
			x: p.x - from.x,
			z: p.z - from.z
		}, turns);
		return {
			x: center.x + r.x,
			z: center.z + r.z
		};
	};
	for (const slot of result.slots) {
		slot.storageAnchorMm = {
			...slot.storageAnchorMm,
			...point(slot.storageAnchorMm)
		};
		slot.approachPointMm = point(slot.approachPointMm);
	}
	return result;
}
/** Scenario-only orientation recovery, relative to the explicit canonical asset frame. */
function resolveRackOrientations(scenarioRaw, canonicalRaw) {
	const scenario = parseOperationsScenario(structuredClone(scenarioRaw));
	const canonical = parseOperationsScenario(structuredClone(canonicalRaw));
	const actual = buildRackAttachmentMap(scenario), originals = buildRackAttachmentMap(canonical);
	if (canonicalStringify([...actual.keys()].sort()) !== canonicalStringify([...originals.keys()].sort())) throw new Error("OWNERSHIP_MISMATCH: rack IDs");
	return [...actual.values()].map((a) => {
		const original = originals.get(a.rackId);
		const matches = [
			0,
			1,
			2,
			3
		].filter((t) => canonicalStringify(rotatedAttachment(original, a.rack.positionMm, t)) === canonicalStringify(a));
		if (matches.length !== 1) throw new Error(`${matches.length ? "AMBIGUOUS_ORIENTATION" : "NON_RIGID_GEOMETRY"}: ${a.rackId}; ${matches.length} canonical rigid reconstructions`);
		const quarterTurns = matches[0];
		return {
			rackId: a.rackId,
			centerMm: { ...a.rack.positionMm },
			quarterTurns,
			yawDeg: quarterTurns * 90,
			convention: "THREE_POSITIVE_Y:(dx,dz)->(dz,-dx)",
			intrinsicDimensionsMm: structuredClone(original.rack.dimensionsMm),
			localSlots: original.slots.map((slot) => ({
				...structuredClone(slot),
				storageAnchorMm: {
					...slot.storageAnchorMm,
					x: slot.storageAnchorMm.x - original.rack.positionMm.x,
					z: slot.storageAnchorMm.z - original.rack.positionMm.z
				},
				approachPointMm: {
					x: slot.approachPointMm.x - original.rack.positionMm.x,
					z: slot.approachPointMm.z - original.rack.positionMm.z
				}
			}))
		};
	});
}
function applyRackQuarterTurn(baselineRaw, raw, canonicalScenario, attachments) {
	const baseline = parseOperationsScenario(structuredClone(baselineRaw));
	const proposal = parseProposal(raw);
	resolveRackOrientations(baseline, canonicalScenario);
	const canonicalMap = buildRackAttachmentMap(baseline);
	const entries = (map) => [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
	if (canonicalStringify(entries(canonicalMap)) !== canonicalStringify(entries(attachments))) throw new Error(`OWNERSHIP_MISMATCH: complete rack attachment map`);
	const expected = canonicalMap.get(proposal.entityId), declaration = structuredClone(attachments.get(proposal.entityId));
	if (!expected || canonicalStringify(expected) !== canonicalStringify(declaration)) throw new Error(`OWNERSHIP_MISMATCH: ${proposal.entityId}`);
	const after = rotatedAttachment(expected, expected.rack.positionMm, proposal.quarterTurns);
	const candidate = structuredClone(baseline);
	candidate.geometry.racks[candidate.geometry.racks.findIndex((r) => r.id === proposal.entityId)] = after.rack;
	for (const slot of after.slots) candidate.locations[candidate.locations.findIndex((l) => l.id === slot.id)] = slot;
	const scenario = parseOperationsScenario(candidate);
	const frames = resolveRackOrientations(scenario, canonicalScenario);
	return {
		scenario,
		transform: {
			entityId: proposal.entityId,
			quarterTurns: proposal.quarterTurns,
			centerMm: { ...expected.rack.positionMm }
		},
		attachmentsBefore: structuredClone(expected),
		viewerPlacement: {
			attachment: structuredClone(after),
			assetFrame: frames.find((f) => f.rackId === proposal.entityId)
		},
		changedFields: diffPaths(baseline, scenario)
	};
}
async function runRackRotationComparison(input) {
	input = structuredClone(input);
	const baseline = parseOperationsScenario(input.baselineScenario), canonical = parseOperationsScenario(input.canonicalScenario), proposal = parseProposal(input.proposal), approved = parseAuthority(input.approvedRotation), config = parseOperationsExecutionConfig(input.executionConfig);
	if (!Number.isSafeInteger(input.safetyCeilingMs) || input.safetyCeilingMs <= 0) throw new Error("Invalid safety ceiling");
	const bundle = applyRackQuarterTurn(baseline, proposal, canonical, input.attachments);
	const approvedShared = {
		...defaultApprovedConstraints(approved.allowedRackIds),
		lockedEntityIds: approved.lockedRackIds
	};
	const structural = await validateProposalAgainstBaseline({
		...proposal,
		kind: "PACKING_STATION_TRANSLATION",
		target: {
			mode: "DELTA_MM",
			deltaMm: {
				dx: 0,
				dz: 0
			}
		}
	}, baseline, new Set(input.attachments.keys()), approvedShared);
	const issue = (code, message) => ({
		code,
		severity: "error",
		entityId: proposal.entityId,
		message
	});
	if (!approved.allowedQuarterTurns.includes(proposal.quarterTurns)) structural.push(issue("ROTATION_NOT_ALLOWED", "Turn count not in approved authority"));
	if (approved.maxRotatedRacks < 1 || proposal.quarterTurns > approved.maxQuarterTurns) structural.push(issue("ROTATION_BUDGET_EXCEEDED", "Rotation exceeds separately approved budget"));
	const base = geometryAccessIssuesFor(baseline), candidate = geometryAccessIssuesFor(bundle.scenario);
	for (const [scenario, issues] of [[baseline, base.issues], [bundle.scenario, candidate.issues]]) try {
		createOperationsController({
			scenario,
			executionConfig: config
		});
	} catch (e) {
		issues.push(issue("ENGINE_ADMISSION_FAILED", String(e)));
	}
	const candidateValid = !structural.length && !candidate.issues.length;
	const baselineRun = base.issues.length ? null : runOne(baseline, config, input.safetyCeilingMs), candidateRun = candidateValid ? runOne(bundle.scenario, config, input.safetyCeilingMs) : null;
	const delta = baselineRun && candidateRun ? {
		shipped: candidateRun.metrics.shipped - baselineRun.metrics.shipped,
		backlog: candidateRun.metrics.backlog - baselineRun.metrics.backlog,
		stageBacklog: candidateRun.metrics.stageBacklog - baselineRun.metrics.stageBacklog,
		totalWaitMs: candidateRun.metrics.totalWaitMs - baselineRun.metrics.totalWaitMs,
		makespanMs: baselineRun.metrics.makespanMs !== null && candidateRun.metrics.makespanMs !== null ? candidateRun.metrics.makespanMs - baselineRun.metrics.makespanMs : null,
		lastShippedAtMs: baselineRun.metrics.lastShippedAtMs !== null && candidateRun.metrics.lastShippedAtMs !== null ? candidateRun.metrics.lastShippedAtMs - baselineRun.metrics.lastShippedAtMs : null,
		stopClockMs: candidateRun.metrics.stopClockMs - baselineRun.metrics.stopClockMs
	} : null;
	return {
		schema: "layoutlab.rack-rotation-comparison/1",
		versions: { ...versions },
		commonInputs: {
			scenario: baseline,
			canonicalScenario: canonical,
			executionConfig: config
		},
		proposal,
		approvedRotation: approved,
		attachments: [...input.attachments.values()],
		safetyCeilingMs: input.safetyCeilingMs,
		parentHash: await contentSha256(baseline),
		bundle,
		validation: {
			baselineValid: !base.issues.length,
			candidateValid,
			structural,
			baseline: base,
			candidate
		},
		measurement: !candidateValid ? "not-measured" : base.issues.length ? "candidate-only-repaired" : "measured",
		baselineRun,
		candidateRun,
		delta,
		evaluationScope: scopeFor(baseline, input.safetyCeilingMs, baselineRun?.termination ?? null, candidateRun?.termination ?? null),
		improvement: baselineRun && candidateRun ? classifyImprovement(baselineRun.metrics, candidateRun.metrics) : "not-measured"
	};
}
async function verifyRackRotationComparison(raw) {
	try {
		const report = structuredClone(raw);
		if (report.schema !== "layoutlab.rack-rotation-comparison/1" || canonicalStringify(report.versions) !== canonicalStringify(versions)) return false;
		return canonicalStringify(await runRackRotationComparison({
			baselineScenario: report.commonInputs.scenario,
			canonicalScenario: report.commonInputs.canonicalScenario,
			proposal: report.proposal,
			attachments: new Map(report.attachments.map((a) => [a.rackId, a])),
			approvedRotation: report.approvedRotation,
			executionConfig: report.commonInputs.executionConfig,
			safetyCeilingMs: report.safetyCeilingMs
		})) === canonicalStringify(report);
	} catch {
		return false;
	}
}
// packages/simulation/src/layout/agent-placement.ts
function stationShape(proposal) {
	return {
		...proposal,
		kind: "PACKING_STATION_TRANSLATION"
	};
}
function parseAgentProposal(raw) {
	if (typeof raw !== "object" || raw === null || raw.kind !== "AGENT_INITIAL_PLACEMENT") throw new Error("Expected AGENT_INITIAL_PLACEMENT");
	const parsed = parseLayoutProposal({
		...raw,
		kind: "PACKING_STATION_TRANSLATION"
	});
	if (!parsed.ok || !parsed.supported) throw new Error("Invalid agent placement proposal");
	return {
		...parsed.proposal,
		kind: "AGENT_INITIAL_PLACEMENT"
	};
}
function applyAgentInitialPlacement(baselineRaw, raw) {
	const baseline = parseOperationsScenario(structuredClone(baselineRaw));
	const proposal = parseAgentProposal(raw);
	const unit = baseline.mobileUnits.find((u) => u.id === proposal.entityId);
	if (!unit) throw new Error("Unknown mobile unit");
	const { centreMm, deltaMm } = resolveTargetCentre(stationShape(proposal), unit.parkingSlotMm);
	const candidate = structuredClone(baseline);
	candidate.mobileUnits.find((u) => u.id === unit.id).parkingSlotMm = centreMm;
	return {
		scenario: candidate,
		transform: {
			entityId: unit.id,
			fromCentreMm: unit.parkingSlotMm,
			toCentreMm: { ...centreMm },
			deltaMm: { ...deltaMm }
		},
		changedFields: diffPaths(baseline, candidate)
	};
}
async function runAgentPlacementComparison(input) {
	input = structuredClone(input);
	const baseline = parseOperationsScenario(structuredClone(input.baselineScenario));
	const proposal = parseAgentProposal(input.proposal);
	const approved = parseApprovedConstraints(input.approvedConstraints);
	if (!approved.ok) throw new Error("Invalid approved constraints");
	const config = parseOperationsExecutionConfig(structuredClone(input.executionConfig));
	if (!Number.isSafeInteger(input.safetyCeilingMs) || input.safetyCeilingMs <= 0) throw new Error("Invalid safety ceiling");
	const bundle = applyAgentInitialPlacement(baseline, proposal);
	const structural = await validateProposalAgainstBaseline(stationShape(proposal), baseline, new Set(baseline.mobileUnits.map((u) => u.id)), approved.constraints);
	structural.push(...validateResolvedTransform(stationShape(proposal), bundle.transform.fromCentreMm, approved.constraints).issues);
	const base = geometryAccessIssuesFor(baseline);
	const candidate = geometryAccessIssuesFor(bundle.scenario);
	const admit = (scenario, issues) => {
		for (let i = 0; i < scenario.mobileUnits.length; i++) for (let j = i + 1; j < scenario.mobileUnits.length; j++) {
			const a = scenario.mobileUnits[i], b = scenario.mobileUnits[j];
			if (discsConflict(Math.hypot(a.parkingSlotMm.x - b.parkingSlotMm.x, a.parkingSlotMm.z - b.parkingSlotMm.z), footprintRadiusMm(a.footprintMm), footprintRadiusMm(b.footprintMm))) issues.push({
				code: "OVERLAP",
				severity: "error",
				entityId: a.id,
				relatedEntityId: b.id,
				message: "Initial occupancy discs collide"
			});
		}
		try {
			createOperationsController({
				scenario,
				executionConfig: config
			});
		} catch (e) {
			issues.push({
				code: "ENGINE_ADMISSION_FAILED",
				severity: "error",
				entityId: proposal.entityId,
				message: String(e)
			});
		}
	};
	admit(baseline, base.issues);
	admit(bundle.scenario, candidate.issues);
	const candidateValid = structural.length === 0 && candidate.issues.length === 0;
	const baselineRun = base.issues.length ? null : runOne(baseline, config, input.safetyCeilingMs);
	const candidateRun = candidateValid ? runOne(bundle.scenario, config, input.safetyCeilingMs) : null;
	const delta = baselineRun && candidateRun ? {
		shipped: candidateRun.metrics.shipped - baselineRun.metrics.shipped,
		backlog: candidateRun.metrics.backlog - baselineRun.metrics.backlog,
		stageBacklog: candidateRun.metrics.stageBacklog - baselineRun.metrics.stageBacklog,
		totalWaitMs: candidateRun.metrics.totalWaitMs - baselineRun.metrics.totalWaitMs,
		makespanMs: candidateRun.metrics.makespanMs !== null && baselineRun.metrics.makespanMs !== null ? candidateRun.metrics.makespanMs - baselineRun.metrics.makespanMs : null,
		lastShippedAtMs: candidateRun.metrics.lastShippedAtMs !== null && baselineRun.metrics.lastShippedAtMs !== null ? candidateRun.metrics.lastShippedAtMs - baselineRun.metrics.lastShippedAtMs : null,
		stopClockMs: candidateRun.metrics.stopClockMs - baselineRun.metrics.stopClockMs
	} : null;
	return {
		versions: {
			simulation: SIMULATION_VERSION,
			operationsSchema: OPERATIONS_SCHEMA_VERSION,
			operationsEngine: OPERATIONS_ENGINE_VERSION
		},
		evaluationScope: scopeFor(baseline, input.safetyCeilingMs, baselineRun?.termination ?? null, candidateRun?.termination ?? null),
		delta,
		improvement: baselineRun && candidateRun ? classifyImprovement(baselineRun.metrics, candidateRun.metrics) : "not-measured",
		schema: "layoutlab.agent-placement-comparison/1",
		commonInputs: {
			scenario: baseline,
			executionConfig: config
		},
		proposal,
		approvedConstraints: approved.constraints,
		safetyCeilingMs: input.safetyCeilingMs,
		parentHash: await contentSha256(baseline),
		bundle,
		validation: {
			baselineValid: base.issues.length === 0,
			candidateValid,
			structural,
			baseline: base,
			candidate
		},
		measurement: !candidateValid ? "not-measured" : base.issues.length ? "candidate-only-repaired" : "measured",
		baselineRun,
		candidateRun
	};
}
async function verifyAgentPlacementComparison(report) {
	try {
		if (report.schema !== "layoutlab.agent-placement-comparison/1" || canonicalStringify(report.versions) !== canonicalStringify({
			simulation: "0.1.1",
			operationsSchema: "layoutlab.operations/1",
			operationsEngine: "layoutlab.operations-engine/1"
		})) return false;
		report = structuredClone(report);
		return canonicalStringify(await runAgentPlacementComparison({
			baselineScenario: report.commonInputs.scenario,
			proposal: report.proposal,
			approvedConstraints: report.approvedConstraints,
			executionConfig: report.commonInputs.executionConfig,
			safetyCeilingMs: report.safetyCeilingMs
		})) === canonicalStringify(report);
	} catch {
		return false;
	}
}
export { COORDINATE_SYSTEM, CORRIDOR_BASE_CENTRE_X, CORRIDOR_EXECUTION_CONFIG, DECISION_CRITERION, DEFAULT_OPERATIONS_SAFETY_CEILING_MS, LAYOUT_COMPARISON_SCHEMA, LAYOUT_DRAFT_VERSION, LOCKED_ENTITY_IDS, LayoutAttachmentError, MAIN_WAREHOUSE_ATTACHMENTS, OPERATIONS_ENGINE_VERSION, OPERATIONS_SCHEMA_VERSION, SIMULATION_VERSION, SUPPORTED_KIND, UNSUPPORTED_KINDS, applyAgentInitialPlacement, applyOperationsPatch, applyPackingStationTranslation, applyRackQuarterTurn, applyRackTranslation, attachmentsFromBindings, buildCorridorScenario, buildRackAttachmentMap, buildStationAttachmentMap, canonicalStringify, classifyImprovement, contentSha256, corridorAttachment, createOperationsController, defaultApprovedConstraints, defaultConstraints, diffPaths, getAtJsonPath, isAllowedLayoutPath, operationsRunMetrics, operationsScenarioSchema, parseApprovedConstraints, parseInterventionPolicy, parseLayoutProposal, parseOperationsExecutionConfig, parseOperationsPatch, parseOperationsScenario, recomputeOperationsReport, resolveRackOrientations, resolveTargetCentre, rotateRackOffset, runAgentPlacementComparison, runLayoutComparison, runOperationsExperiment, runOperationsToTermination, runRackLayoutComparison, runRackRotationComparison, sha256Hex, snapToGridMm, validateLayoutCandidate, validateProposalAgainstBaseline, validateResolvedTransform, verifyAgentPlacementComparison, verifyLayoutComparison, verifyOperationsExperiment, verifyRackLayoutComparison, verifyRackRotationComparison, viewerPlacementFromCandidate };
