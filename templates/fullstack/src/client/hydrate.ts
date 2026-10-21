import { component, type RiotComponent, type RiotComponentWrapper } from 'riot';

/**
 * Bind a server-rendered Riot tag to the nodes already in the document.
 *
 * `@riotjs/hydrate` v10 does not do this. It clones the root, mounts a new
 * tree on the clone, copies form state across, and `replaceChild`s the server
 * node. Riot's own template mount appends that new tree; `if` and `each`
 * then drop their placeholder nodes. There is no public flag to reuse the
 * parsed markup, so this mounts with `avoidDOMInjection` after copying the
 * compiler's `exprN` markers onto the matching server elements. Listeners
 * attach to those elements. A later `update()` edits them in place.
 *
 * Markers are stamped at mount, after Riot has read the root attributes into
 * props, so the markers never become props.
 */
export function hydrate<Props extends object, State extends object>(
  wrapper: RiotComponentWrapper<RiotComponent<Props, State>>,
): (element: HTMLElement, props?: Props) => RiotComponent<Props, State> {
  const mount = component(inPlace(wrapper));
  return (element, props) => mount(element, props ?? ({} as Props));
}

export function readHydrationState(): Record<string, object> {
  const node = document.getElementById('riot-state');
  if (!node?.textContent) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(node.textContent);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed as Record<string, object>;
}

const EXPR = /^expr\d+$/;

function inPlace<Props extends object, State extends object>(
  source: RiotComponentWrapper<RiotComponent<Props, State>>,
): RiotComponentWrapper<RiotComponent<Props, State>> {
  const template = source.template;
  if (!template) {
    throw new Error(`Cannot hydrate <${source.name ?? 'component'}>`);
  }
  return {
    css: source.css,
    exports: source.exports,
    name: source.name,
    template(create, expressionTypes, bindingTypes, getComponent) {
      const chunk = template(
        create,
        expressionTypes,
        bindingTypes,
        getComponent,
      );
      if (!chunk) {
        throw new Error(`Cannot hydrate <${source.name ?? 'component'}>`);
      }
      const mount = chunk.mount;
      const html = chunk.html ?? '';
      chunk.mount = function (el, scope, parentScope, meta) {
        if (html) stamp(el, html);
        return mount.call(this, el, scope, parentScope, {
          ...meta,
          avoidDOMInjection: true,
        } as Parameters<typeof mount>[3]);
      };
      return chunk;
    },
  };
}

function stamp(root: ParentNode, skeleton: string): void {
  const holder = document.createElement('div');
  holder.innerHTML = skeleton;
  align(root, holder);
}

function align(live: ParentNode, skeleton: ParentNode): void {
  const liveElements = elementsOf(live);
  let index = 0;
  for (const next of elementsOf(skeleton)) {
    const current = liveElements[index];
    if (current && current.tagName === next.tagName) {
      copyExpr(current, next);
      align(current, next);
      index += 1;
      continue;
    }
    // A false `if` is absent from the server HTML. Insert the marker so the
    // binding can find it; Riot removes the marker again when the condition
    // is still false. Nodes that were already on the page stay put.
    live.insertBefore(next.cloneNode(true), current ?? null);
  }
}

function elementsOf(node: ParentNode): Element[] {
  const elements: Element[] = [];
  for (const child of node.childNodes) {
    if (child.nodeType === 1) elements.push(child as Element);
  }
  return elements;
}

function copyExpr(live: Element, skeleton: Element): void {
  for (const attr of skeleton.attributes) {
    if (EXPR.test(attr.name)) live.setAttribute(attr.name, attr.value);
  }
}
