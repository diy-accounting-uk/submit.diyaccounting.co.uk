// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/xmlCanonical.js
// Canonical XML 1.0 (https://www.w3.org/TR/2001/REC-xml-c14n-20010315), inclusive and without
// comments, of one element and its descendants. HMRC's IRmark is a SHA-1 of the canonical form of
// a GovTalk Body, so this parses the document itself: a DOM parser normalises namespace and
// attribute details that the canonical form depends on. Documents with a DOCTYPE are refused,
// because nothing HMRC accepts carries one and entity declarations would change the output.

const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";

export class XmlCanonicalError extends Error {
  constructor(message) {
    super(message);
    this.name = "XmlCanonicalError";
  }
}

const PREDEFINED_ENTITIES = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decodeReferences(raw, position) {
  return raw.replace(/&([^;&]*);/g, (match, name) => {
    if (name.startsWith("#x")) return String.fromCodePoint(parseInt(name.slice(2), 16));
    if (name.startsWith("#")) return String.fromCodePoint(parseInt(name.slice(1), 10));
    if (Object.hasOwn(PREDEFINED_ENTITIES, name)) return PREDEFINED_ENTITIES[name];
    throw new XmlCanonicalError(`Unknown entity reference &${name}; near offset ${position}`);
  });
}

function normaliseAttributeValue(raw, position) {
  return decodeReferences(raw.replace(/[\t\n]/g, " "), position);
}

const NAME_PATTERN = /[^\s/>=]+/y;
const ATTRIBUTE_PATTERN = /\s*([^\s/>=]+)\s*=\s*("([^"]*)"|'([^']*)')/y;

function terminatorIndex(source, terminator, from, what) {
  const end = source.indexOf(terminator, from);
  if (end === -1) throw new XmlCanonicalError(`Unterminated ${what} at offset ${from}`);
  return end;
}

function readText(source, index) {
  const next = source.indexOf("<", index);
  const end = next === -1 ? source.length : next;
  return { node: { type: "text", value: decodeReferences(source.slice(index, end), index) }, next: end };
}

function readProcessingInstruction(source, index) {
  const end = terminatorIndex(source, "?>", index + 2, "processing instruction");
  const content = source.slice(index + 2, end);
  const target = content.match(/^\S+/)[0];
  const node = target.toLowerCase() === "xml" ? null : { type: "pi", target, data: content.slice(target.length).replace(/^\s+/, "") };
  return { node, next: end + 2 };
}

function readAttributes(source, element, from) {
  let cursor = from;
  for (;;) {
    ATTRIBUTE_PATTERN.lastIndex = cursor;
    const match = ATTRIBUTE_PATTERN.exec(source);
    if (!match) return cursor;
    const raw = match[3] ?? match[4];
    if (raw.includes("<")) throw new XmlCanonicalError(`'<' in an attribute value at offset ${cursor}`);
    if (element.attributes.some((attribute) => attribute.name === match[1])) {
      throw new XmlCanonicalError(`Duplicate attribute ${match[1]} at offset ${cursor}`);
    }
    element.attributes.push({ name: match[1], value: normaliseAttributeValue(raw, cursor) });
    cursor = ATTRIBUTE_PATTERN.lastIndex;
  }
}

function readStartTag(source, index) {
  NAME_PATTERN.lastIndex = index + 1;
  const nameMatch = NAME_PATTERN.exec(source);
  if (!nameMatch) throw new XmlCanonicalError(`Malformed start tag at offset ${index}`);
  const element = { type: "element", name: nameMatch[0], attributes: [], children: [], parent: null };
  const close = /\s*(\/?)>/y;
  close.lastIndex = readAttributes(source, element, NAME_PATTERN.lastIndex);
  const closeMatch = close.exec(source);
  if (!closeMatch) throw new XmlCanonicalError(`Malformed start tag <${element.name}> at offset ${index}`);
  return { node: element, selfClosing: closeMatch[1] === "/", next: close.lastIndex };
}

function readMarkup(source, index) {
  if (source.startsWith("<!--", index)) return { node: null, next: terminatorIndex(source, "-->", index + 4, "comment") + 3 };
  if (source.startsWith("<![CDATA[", index)) {
    const end = terminatorIndex(source, "]]>", index + 9, "CDATA section");
    return { node: { type: "text", value: source.slice(index + 9, end) }, next: end + 3 };
  }
  if (source.startsWith("<!DOCTYPE", index)) throw new XmlCanonicalError("Documents with a DOCTYPE are not canonicalised");
  if (source.startsWith("<?", index)) return readProcessingInstruction(source, index);
  if (source.startsWith("</", index)) {
    const end = terminatorIndex(source, ">", index, "end tag");
    return { endTag: source.slice(index + 2, end).trim(), next: end + 1 };
  }
  return readStartTag(source, index);
}

/**
 * Parse an XML document into a light tree: elements carry their qualified name, attributes in
 * document order, children and a parent link; text nodes carry decoded text; processing
 * instructions carry target and data. Comments are dropped, as canonical XML without comments
 * drops them. Line endings are normalised to line feeds first, as an XML processor does.
 * @param {string} xml
 * @returns {{type: "element", name: string, attributes: {name: string, value: string}[], children: object[], parent: object|null}}
 */
export function parseXmlTree(xml) {
  const source = xml.replace(/\r\n?/g, "\n");
  let index = 0;
  let root = null;
  const stack = [];

  const append = (node) => {
    if (stack.length > 0) {
      const parent = stack[stack.length - 1];
      node.parent = parent;
      parent.children.push(node);
      return;
    }
    if (node.type !== "element") return;
    if (root) throw new XmlCanonicalError("More than one root element");
    root = node;
  };

  while (index < source.length) {
    const read = source[index] === "<" ? readMarkup(source, index) : readText(source, index);
    if (read.endTag !== undefined) {
      const open = stack.pop();
      if (!open || open.name !== read.endTag) {
        throw new XmlCanonicalError(`End tag </${read.endTag}> at offset ${index} does not close <${open ? open.name : ""}>`);
      }
    } else if (read.node) {
      append(read.node);
      if (read.node.type === "element" && !read.selfClosing) stack.push(read.node);
    }
    index = read.next;
  }

  if (stack.length > 0) throw new XmlCanonicalError(`Unclosed element <${stack[stack.length - 1].name}>`);
  if (!root) throw new XmlCanonicalError("No root element");
  return root;
}

export function localName(qualifiedName) {
  const colon = qualifiedName.indexOf(":");
  return colon === -1 ? qualifiedName : qualifiedName.slice(colon + 1);
}

function prefixOf(qualifiedName) {
  const colon = qualifiedName.indexOf(":");
  return colon === -1 ? "" : qualifiedName.slice(0, colon);
}

function isNamespaceDeclaration(attributeName) {
  return attributeName === "xmlns" || attributeName.startsWith("xmlns:");
}

function declaredPrefix(attributeName) {
  return attributeName === "xmlns" ? "" : attributeName.slice(6);
}

function inScopeNamespaces(element) {
  const chain = [];
  for (let node = element; node; node = node.parent) chain.unshift(node);
  const scope = new Map();
  for (const node of chain) {
    for (const attribute of node.attributes) {
      if (isNamespaceDeclaration(attribute.name)) scope.set(declaredPrefix(attribute.name), attribute.value);
    }
  }
  return scope;
}

function escapeText(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
}

function escapeAttribute(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/\t/g, "&#x9;")
    .replace(/\n/g, "&#xA;")
    .replace(/\r/g, "&#xD;");
}

function compareCodeUnits(left, right) {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

function inheritedXmlAttributes(element) {
  const inherited = new Map();
  for (let node = element.parent; node; node = node.parent) {
    for (const attribute of node.attributes) {
      if (attribute.name.startsWith("xml:") && !inherited.has(attribute.name)) inherited.set(attribute.name, attribute.value);
    }
  }
  return inherited;
}

function renderElement(element, scope, renderedAbove, exclude, isApex) {
  const elementScope = new Map(scope);
  for (const attribute of element.attributes) {
    if (isNamespaceDeclaration(attribute.name)) elementScope.set(declaredPrefix(attribute.name), attribute.value);
  }

  const namespaceNodes = [];
  const rendered = new Map(renderedAbove);
  for (const [prefix, uri] of elementScope) {
    if (prefix === "xml") continue;
    if (prefix === "" && uri === "") {
      if ((renderedAbove.get("") ?? "") !== "") {
        namespaceNodes.push({ prefix, uri });
        rendered.set(prefix, uri);
      }
      continue;
    }
    if (renderedAbove.get(prefix) !== uri) {
      namespaceNodes.push({ prefix, uri });
      rendered.set(prefix, uri);
    }
  }
  namespaceNodes.sort((left, right) => compareCodeUnits(left.prefix, right.prefix));

  const attributes = element.attributes
    .filter((attribute) => !isNamespaceDeclaration(attribute.name))
    .map((attribute) => ({ ...attribute }));
  if (isApex) {
    for (const [name, value] of inheritedXmlAttributes(element)) {
      if (!attributes.some((attribute) => attribute.name === name)) attributes.push({ name, value });
    }
  }
  const attributeNamespace = (name) => {
    const prefix = prefixOf(name);
    if (prefix === "") return "";
    if (prefix === "xml") return XML_NAMESPACE;
    if (!elementScope.has(prefix)) throw new XmlCanonicalError(`Undeclared namespace prefix ${prefix} on attribute ${name}`);
    return elementScope.get(prefix);
  };
  attributes.sort(
    (left, right) =>
      compareCodeUnits(attributeNamespace(left.name), attributeNamespace(right.name)) ||
      compareCodeUnits(localName(left.name), localName(right.name)),
  );

  const elementPrefix = prefixOf(element.name);
  if (elementPrefix !== "" && elementPrefix !== "xml" && !elementScope.has(elementPrefix)) {
    throw new XmlCanonicalError(`Undeclared namespace prefix ${elementPrefix} on element ${element.name}`);
  }

  let output = `<${element.name}`;
  for (const node of namespaceNodes)
    output += node.prefix === "" ? ` xmlns="${escapeAttribute(node.uri)}"` : ` xmlns:${node.prefix}="${escapeAttribute(node.uri)}"`;
  for (const attribute of attributes) output += ` ${attribute.name}="${escapeAttribute(attribute.value)}"`;
  output += ">";
  for (const child of element.children) {
    if (child.type === "text") output += escapeText(child.value);
    else if (child.type === "pi") output += child.data ? `<?${child.target} ${child.data}?>` : `<?${child.target}?>`;
    else if (!exclude(child)) output += renderElement(child, elementScope, rendered, exclude, false);
  }
  return `${output}</${element.name}>`;
}

/**
 * Canonical XML 1.0 (inclusive, without comments) of an element and its descendants, as an XPath
 * node-set of that subtree would canonicalise: the element carries every namespace in scope,
 * including those declared on its ancestors, and any xml:* attributes it inherits.
 * @param {object} element - a node from parseXmlTree
 * @param {object} [options]
 * @param {(element: object) => boolean} [options.exclude] - descendant elements to leave out, with their subtrees; the text around them stays
 * @returns {string}
 */
export function canonicaliseElement(element, { exclude = () => false } = {}) {
  const ancestorScope = element.parent ? inScopeNamespaces(element.parent) : new Map();
  return renderElement(element, ancestorScope, new Map(), exclude, true);
}

/**
 * The first child element with the given local name, or undefined.
 * @param {object} element
 * @param {string} name
 */
export function childElement(element, name) {
  return element.children.find((child) => child.type === "element" && localName(child.name) === name);
}
