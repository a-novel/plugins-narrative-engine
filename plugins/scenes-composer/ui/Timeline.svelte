<!--
@component
The timeline of a composer: scenes are columns under their beat, layers are tracks, and the names of
both stay in view while the grid scrolls. What a layer holds for a scene is a card on its track: a
band in the color of its layer over the text. A column and a track stretch, and keep their size.

A beat, a scene and a layer are each edited whole in a dialog, and a card where it stands. The second
button of a pointer opens the menu of what it points at. The arrow keys move between the headers and
the cards, which take the focus one at a time: Enter or F2 edits the one in focus, the menu key opens
its menu, Delete removes a card, and Alt with an arrow stretches a column or a track.

In a narrow box, such as a phone gives, the timeline shows one scene at a time. A swipe moves to the
next one, a tap opens everything a writer can do with what it touches, and a button shows the names
of the layers over the cards.
-->
<script lang="ts">
  import Described from "./Described.svelte";
  import Editor from "./Editor.svelte";
  import type { Composer } from "./composer.svelte.ts";
  import type { Beat, Cell, Content, Layer, Scene, ScriptCell } from "./content.ts";
  import { DEFAULT_WIDTH, LIMITS, type TextKind } from "./edits.ts";
  import { fill } from "./messages.ts";
  import type { Messages } from "./presets.ts";

  import { tick } from "svelte";

  import {
    ActionMenu,
    type ActionMenuAction,
    type ActionMenuItem,
    Button,
    ColorField,
    type ColorFieldController,
    Dialog,
    Field,
    IconButton,
    Input,
    Textarea,
    createOpenController,
    createValueController,
    customColorStyle,
  } from "@a-novel-kit/uikit";

  import { ChevronLeft, ChevronRight, Layers, Plus } from "@lucide/svelte";

  interface Props {
    composer: Composer;
    /** The content of the composer, which holds a beat at least. */
    content: Content;
    messages: Messages;
    /** The locale of the host, which formats the counts. */
    locale: string;
  }

  let { composer, content, messages, locale }: Props = $props();

  const formId = $props.id();

  const text = $derived(messages.timeline);
  const numbers = $derived(new Intl.NumberFormat(locale));
  const plurals = $derived(new Intl.PluralRules(locale));

  // The characters of a text a card draws: it shows a few lines of them at most.
  const EXCERPT = 1200;

  // The kinds of layer a writer adds here. A script and a link layer come with the views that fill them.
  const ADDED = ["logline", "notes"] as const;

  // What a key stretches a column or a track by, in quarters of the base text size.
  const STEP = 8;

  // The width of the box under which the timeline shows one scene at a time, in times the base text
  // size, as the styles count it. And how far a finger travels across for a swipe, in pixels.
  const NARROW = 48;
  const SWIPE = 48;

  // Where each beat starts: its first column, and the scenes the story tells before it. A beat
  // without a scene keeps one column, so it stays in view.
  const starts = $derived.by(() => {
    let column = 1;
    let before = 0;

    return content.beats.map(({ scenes }) => {
      const start = { column, before };
      column += Math.max(scenes.length, 1);
      before += scenes.length;

      return start;
    });
  });
  const columns = $derived(content.beats.reduce((total, { scenes }) => total + Math.max(scenes.length, 1), 0));
  const foot = $derived(content.layers.length + 2);

  // The card being edited where it stands, as `<scene ID>/<layer ID>`.
  let editing = $state<string>();

  let grid = $state<HTMLElement>();
  // The header or the card the Tab key reaches, which is the last one that held the focus.
  let reached: HTMLElement | undefined;
  // The column the focus last stood in, which a move up to a beat and back down keeps.
  let column = 0;

  // The width of the box, and whether it is narrow: the timeline then shows one column, `shown`,
  // which follows the story when columns come and go.
  let width = $state(0);
  const narrow = $derived(width > 0 && width < NARROW * rem());
  let current = $state(1);
  const shown = $derived(Math.min(Math.max(current, 1), columns));
  // Whether a narrow box shows the names of the layers over the cards.
  let named = $state(false);
  // Where a finger went down in a narrow box.
  let swipe: { x: number; y: number } | undefined;

  // Whether the timeline has scrolled down, which takes what describes a column out of view, and how
  // tall the names of the beats stand: the names of the scenes stay in view under them.
  let scrolled = $state(false);
  let head = $state(0);

  // The column or the track a pointer is stretching, at the size it has under the pointer.
  let stretching = $state.raw<{ id: string; size: number }>();
  // Where that pointer went down, and the size the column or the track had then.
  let drag: { id: string; axis: "width" | "height"; from: number; size: number } | undefined;

  const widthOf = (scene: Scene) => (stretching?.id === scene.id ? stretching.size : (scene.width ?? DEFAULT_WIDTH));
  const heightOf = (layer: Layer) => (stretching?.id === layer.id ? stretching.size : layer.height);

  /** Writes a size the content holds, in quarters of the base text size, as CSS reads it. */
  const length = (size: number) => `${size / 4}rem`;

  // The columns of the grid: the layers', each scene's at its own width, then the room that is left.
  // A beat without a scene keeps a column of the default width.
  const template = $derived(
    [
      "var(--side)",
      ...content.beats.flatMap(({ scenes }) =>
        scenes.length > 0 ? scenes.map((scene) => length(widthOf(scene))) : ["var(--scene)"]
      ),
      "minmax(max-content, 1fr)",
    ].join(" ")
  );

  const layerMenu = createOpenController();

  // What a dialog edits whole: a beat or a scene with its title and its description, a layer with
  // the color its field shows, and in a narrow box a card with its text. It stays once the dialog
  // closes, which fades out.
  type Edited =
    | { kind: "beat" | "scene"; id: string; name: string; title: string; description: string }
    | { kind: "layer"; id: string; layer: Layer; color: ColorFieldController }
    | { kind: "card"; id: string; name: string; scene: string; layer: string; holds: TextKind; text: string };
  let edited = $state.raw<Edited>();
  const dialog = createOpenController({
    // The dialog gives the focus back to what opened it, which may be gone. The header or the card it
    // edits takes it instead, so the arrow keys go on from there.
    onOpenChange: (open) => void (open || tick().then(() => edited && stopOf(edited.id)?.focus())),
  });

  // The header or the card whose menu is open, and where the menu opens: under the pointer, or under
  // the item for a key.
  let chosen = $state.raw<{ key: string; label: string; items: ActionMenuItem[]; x: number; y: number }>();
  let anchor = $state<HTMLButtonElement>();
  const menu = createOpenController({
    // The menu gives the focus back to its anchor, which is no place to go on from.
    onOpenChange: (open) => {
      if (open) return;
      void tick().then(() => editing === undefined && !dialog.state.open && chosen && stopOf(chosen.key)?.focus());
    },
  });

  const beatName = (beat: Beat, index: number) => beat.title || fill(text.beats.untitled, { position: index + 1 });
  const sceneName = (scene: Scene, position: number) => scene.title || fill(text.scenes.untitled, { position });
  const layerName = (layer: Layer) => layer.name || text.layers.kinds[layer.kind];

  /** Tells whether a cell holds something to read: a cell can be there and empty. */
  const written = (cell: Cell | undefined) =>
    cell !== undefined && (cell.kind === "script" ? cell.blocks.some((block) => block.text !== "") : cell.text !== "");

  /** Reads a script cell as its card shows it: the start of its text, and its count of words. */
  function script({ blocks }: ScriptCell) {
    const lines = blocks.map((block) => (block.kind === "dialogue" ? `${block.speaker}: ${block.text}` : block.text));
    const words = blocks.reduce((total, block) => total + (block.text.match(/\S+/g)?.length ?? 0), 0);
    const counted = text.cells[plurals.select(words) === "one" ? "words_one" : "words_other"];

    return { excerpt: lines.join("\n").slice(0, EXCERPT), count: fill(counted, { count: numbers.format(words) }) };
  }

  type Found =
    | { kind: "beat"; beat: Beat; index: number; name: string }
    | { kind: "scene"; beat: Beat; scene: Scene; place: number; name: string }
    | { kind: "layer"; layer: Layer; name: string };

  /** Finds the beat, the scene or the layer of an ID, with the name the timeline shows for it. */
  function found(id: string): Found | undefined {
    for (const [index, beat] of content.beats.entries()) {
      if (beat.id === id) return { kind: "beat", beat, index, name: beatName(beat, index) };

      const place = beat.scenes.findIndex((scene) => scene.id === id);
      if (place < 0) continue;

      const scene = beat.scenes[place]!;

      return { kind: "scene", beat, scene, place, name: sceneName(scene, starts[index]!.before + place + 1) };
    }

    const layer = content.layers.find((held) => held.id === id);

    return layer && { kind: "layer", layer, name: layerName(layer) };
  }

  /** Finds the scene and the layer the key of a card names, and what the layer holds for the scene. */
  function cardOf(key: string) {
    const [sceneId, layerId] = key.split("/");
    const layer = content.layers.find(({ id }) => id === layerId);
    const scenes = content.beats.flatMap((beat) => beat.scenes);
    const place = scenes.findIndex(({ id }) => id === sceneId);
    if (!layer || place < 0) return undefined;

    const scene = scenes[place]!;
    const names = { layer: layerName(layer), scene: sceneName(scene, place + 1) };

    return { scene, layer, names, cell: scene.cells.find((held) => held.layer === layer.id) };
  }

  /** Finds the header or the card at a row and a column. A beat stands at every column it spans. */
  function stopAt(row: number, col: number): HTMLElement | null | undefined {
    if (row !== 0) return grid?.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`);

    const beats = Array.from(grid?.querySelectorAll<HTMLElement>('[data-row="0"]') ?? []);

    return col < 1 ? undefined : beats.findLast((beat) => Number(beat.dataset.col) <= col);
  }

  const stopOf = (key: string) => grid?.querySelector<HTMLElement>(`[data-key="${key}"]`);

  /** Finds where a key moves the focus to from a header or a card. */
  function beside(stop: HTMLElement, key: string): HTMLElement | null | undefined {
    const row = Number(stop.dataset.row);
    const start = Number(stop.dataset.col);
    const end = start + Number(stop.dataset.span ?? 1) - 1;
    const across = Math.min(Math.max(column, start), end);
    const inRow = Array.from(grid?.querySelectorAll<HTMLElement>(`[data-row="${row}"]`) ?? []);

    if (key === "ArrowLeft") return stopAt(row, start - 1);
    if (key === "ArrowRight") return stopAt(row, end + 1);
    if (key === "ArrowUp") return stopAt(row - 1, across);
    if (key === "ArrowDown") return stopAt(row + 1, across);
    if (key === "Home") return inRow[0];
    if (key === "End") return inRow.at(-1);

    return undefined;
  }

  /** Starts the edit of the card of a key, once it is drawn. */
  async function edit(key: string) {
    // A menu gives the focus back as it closes, which would end the edit at once.
    await tick();
    editing = key;
  }

  /** Ends an edit, and moves the focus as the key that ended it asks. */
  async function leave(key: string, move?: "stay" | "next" | "previous") {
    editing = undefined;
    if (move === undefined) return;

    await tick();
    const stop = stopOf(key);
    if (!stop) return;

    const next = move === "stay" ? stop : (beside(stop, move === "next" ? "ArrowRight" : "ArrowLeft") ?? stop);
    next.focus();
    if (next !== stop && next.matches(".cell[data-key]")) editing = next.dataset.key;
  }

  /** Deletes the item of a header, then gives the focus to the header that takes its place. */
  async function remove(key: string, deletes: () => void) {
    const stop = stopOf(key);
    const [row, col] = [Number(stop?.dataset.row), Number(stop?.dataset.col)];

    deletes();
    await tick();
    (stopAt(row, col) ?? stopAt(row, col - 1) ?? stopAt(row - 1, col))?.focus();
  }

  /** Deletes the card of a key, and leaves the focus where it stood. */
  async function discard(key: string) {
    const card = cardOf(key);
    if (!card) return;

    composer.deleteCell(card.scene.id, card.layer.id, fill(text.cells.deleted, card.names));
    await tick();
    stopOf(key)?.focus();
  }

  /**
   * Opens the dialog of what a key names. A beat, a scene and a layer are edited whole there. A card
   * is too in a narrow box, where nothing is edited in place.
   */
  function open(key: string) {
    if (key.includes("/")) {
      const card = cardOf(key);
      if (!card || (card.layer.kind !== "notes" && card.layer.kind !== "logline")) return;

      const holds = card.layer.kind;
      const held = card.cell?.kind === holds ? card.cell.text : "";
      const name = fill(text.cells.label, card.names);
      edited = { kind: "card", id: key, name, scene: card.scene.id, layer: card.layer.id, holds, text: held };
    } else {
      const item = found(key);
      if (!item) return;

      if (item.kind === "layer") {
        const color = createValueController<string | undefined>({ initialValue: item.layer.color });
        edited = { kind: "layer", id: key, layer: item.layer, color };
      } else {
        const { title, description } = item.kind === "beat" ? item.beat : item.scene;
        edited = { kind: item.kind, id: key, name: item.name, title, description };
      }
    }

    dialog.open();
  }

  /**
   * Opens the dialog of an item that was just added, once it is drawn. A narrow box moves to the
   * column of a new beat or scene, which it would otherwise leave out of view.
   */
  async function added(id: string) {
    await tick();
    const col = Number(stopOf(id)?.dataset.col ?? 0);
    if (col > 0) current = col;

    open(id);
  }

  function save(event: SubmitEvent) {
    event.preventDefault();
    if (!edited) return;

    const form = new FormData(event.currentTarget as HTMLFormElement);
    const field = (name: string) => String(form.get(name) ?? "");

    if (edited.kind === "layer") {
      const naming = {
        name: field("name").trim(),
        label: field("label").trim() || undefined,
        color: edited.color.state.value,
      };
      const { name, label, color } = edited.layer;
      if (naming.name !== name || naming.label !== label || naming.color !== color)
        composer.editLayer(edited.id, naming);
    } else if (edited.kind === "card") {
      const wrote = field("text");
      if (wrote !== edited.text) composer.writeCell(edited.scene, edited.layer, edited.holds, wrote);
    } else {
      const heading = { title: field("title").trim(), description: field("description").trim() };
      const same = heading.title === edited.title && heading.description === edited.description;
      if (!same) (edited.kind === "beat" ? composer.editBeat : composer.editScene)(edited.id, heading);
    }

    dialog.close();
  }

  /** Lets Control or Command with Enter save a dialog from a field of several lines. */
  function saves(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) event.currentTarget.form?.requestSubmit();
  }

  /** Gives the column of a scene its default width back, or stretches it by a step. */
  function stretchScene(id: string, by: number | undefined) {
    const scene = content.beats.flatMap((beat) => beat.scenes).find((held) => held.id === id);
    if (scene) composer.resizeScene(id, by === undefined ? undefined : (scene.width ?? DEFAULT_WIDTH) + by);
  }

  /** Leaves the track of a layer to what it holds, or stretches it by a step from the height it shows. */
  function stretchLayer(id: string, by: number | undefined) {
    const shownHeight = ((stopOf(id)?.getBoundingClientRect().height ?? 0) / rem()) * 4;
    composer.resizeLayer(id, by === undefined ? undefined : shownHeight + by);
  }

  /** The base text size of the page, which a stored size counts quarters of. */
  function rem() {
    return parseFloat(getComputedStyle(document.documentElement).fontSize);
  }

  /** Shows the scene after the one a narrow box shows, or the one before. */
  function turn(by: number) {
    current = Math.min(columns, Math.max(1, shown + by));
  }

  function beatActions(beat: Beat, index: number, name: string): ActionMenuItem[] {
    const full = content.beats.length >= LIMITS.items;

    return [
      { id: "edit", label: text.actions.edit, onSelect: () => open(beat.id) },
      {
        id: "scene",
        label: text.scenes.add,
        disabled: beat.scenes.length >= LIMITS.items,
        onSelect: () => added(composer.addScene(beat.id, beat.scenes.length)),
      },
      { id: "before", label: text.beats.addBefore, disabled: full, onSelect: () => added(composer.addBeat(index)) },
      { id: "after", label: text.beats.addAfter, disabled: full, onSelect: () => added(composer.addBeat(index + 1)) },
      { kind: "separator", id: "separator" },
      {
        id: "delete",
        label: text.actions.delete,
        tone: "danger",
        // A composer keeps a beat: one without any has not started, and a story starts from a
        // structure once.
        disabled: content.beats.length === 1,
        onSelect: () => remove(beat.id, () => composer.deleteBeat(beat.id, fill(text.beats.deleted, { name }))),
      },
    ];
  }

  function sceneActions(beat: Beat, scene: Scene, place: number, name: string): ActionMenuItem[] {
    const full = beat.scenes.length >= LIMITS.items;
    const add = (at: number) => () => added(composer.addScene(beat.id, at));

    return [
      { id: "edit", label: text.actions.edit, onSelect: () => open(scene.id) },
      { id: "before", label: text.scenes.addBefore, disabled: full, onSelect: add(place) },
      { id: "after", label: text.scenes.addAfter, disabled: full, onSelect: add(place + 1) },
      { kind: "separator", id: "sizes" },
      {
        id: "width",
        label: text.sizes.defaultWidth,
        disabled: scene.width === undefined,
        onSelect: () => stretchScene(scene.id, undefined),
      },
      { kind: "separator", id: "separator" },
      {
        id: "delete",
        label: text.actions.delete,
        tone: "danger",
        onSelect: () => remove(scene.id, () => composer.deleteScene(scene.id, fill(text.scenes.deleted, { name }))),
      },
    ];
  }

  function layerActions(layer: Layer, name: string): ActionMenuItem[] {
    return [
      { id: "edit", label: text.actions.edit, onSelect: () => open(layer.id) },
      { kind: "separator", id: "sizes" },
      {
        id: "height",
        label: text.sizes.defaultHeight,
        disabled: layer.height === undefined,
        onSelect: () => stretchLayer(layer.id, undefined),
      },
      { kind: "separator", id: "separator" },
      {
        id: "delete",
        label: text.actions.delete,
        tone: "danger",
        // A composer keeps a layer: without one, a story has no track to be written on.
        disabled: content.layers.length === 1,
        onSelect: () => remove(layer.id, () => composer.deleteLayer(layer.id, fill(text.layers.deleted, { name }))),
      },
    ];
  }

  const cardActions = (key: string): ActionMenuItem[] => [
    { id: "edit", label: text.actions.edit, onSelect: () => (narrow ? open(key) : edit(key)) },
    { kind: "separator", id: "separator" },
    { id: "delete", label: text.actions.delete, tone: "danger", onSelect: () => discard(key) },
  ];

  /** Lists what a writer can do with the header or the card of a key, under the name of its menu. */
  function actionsOf(key: string): { label: string; items: ActionMenuItem[] } | undefined {
    if (key.includes("/")) return { label: text.cells.actions, items: cardActions(key) };

    const item = found(key);
    if (!item) return undefined;

    const items =
      item.kind === "beat"
        ? beatActions(item.beat, item.index, item.name)
        : item.kind === "scene"
          ? sceneActions(item.beat, item.scene, item.place, item.name)
          : layerActions(item.layer, item.name);

    return { label: fill(text.actions.of, { name: item.name }), items };
  }

  // A narrow box has no menu: the dialog of an item lists what its menu would, the edit aside, which
  // the dialog is. A sizes action has nothing to act on there, and a place without a card has no
  // action at all, as it has no menu in a wide box.
  const options = $derived(
    narrow && edited && !(edited.kind === "card" && edited.text === "")
      ? (actionsOf(edited.id)?.items ?? []).filter(
          (item): item is ActionMenuAction =>
            item.kind !== "separator" && !["edit", "width", "height"].includes(item.id)
        )
      : []
  );

  // A new layer opens its dialog, where it takes a name and a color.
  const addedLayers = $derived<ActionMenuItem[]>(
    ADDED.map((kind) => ({ id: kind, label: text.layers.kinds[kind], onSelect: () => added(composer.addLayer(kind)) }))
  );

  /**
   * Opens the menu of the header or the card an event comes from, and tells whether it has one. The
   * menu key, Shift with F10 and the second button of a pointer all ask for it, and a browser may
   * send two of them for one press.
   */
  function openMenu(event: Event): boolean {
    const target = event.target as HTMLElement;
    const stop = target.closest<HTMLElement>("[data-row]");
    const key = stop?.dataset.key;
    // A field keeps the menu of the browser, and a place without a card has nothing to act on.
    if (!stop || !key || target.closest("input, textarea") || stop.matches(".cell:not(.written)")) return false;

    const actions = actionsOf(key);
    if (!actions) return false;

    event.preventDefault();
    // The menu opens from an anchor set under the pointer, or under the item for a key.
    const box = stop.getBoundingClientRect();
    const pointed = event instanceof MouseEvent && event.clientX + event.clientY > 0;
    chosen = { key, ...actions, x: pointed ? event.clientX : box.left, y: pointed ? event.clientY : box.bottom };
    if (!menu.state.open) void tick().then(() => anchor?.click());

    return true;
  }

  function onkeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    // A field takes its own keys, and so does an open menu.
    if (event.defaultPrevented || target.closest("input, textarea, [role=menu]")) return;

    const stop = target.closest<HTMLElement>("[data-row]");
    if (!stop) return;
    const key = stop.dataset.key;

    if ((event.key === "Enter" || event.key === "F2") && target === stop && key) {
      event.preventDefault();
      if (stop.matches(".cell") && !narrow) editing = key;
      else open(key);

      return;
    }

    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      target === stop &&
      stop.matches(".written[data-key]")
    ) {
      event.preventDefault();
      void discard(key!);

      return;
    }

    if (event.altKey && target === stop && key) {
      const by = { ArrowRight: STEP, ArrowDown: STEP, ArrowLeft: -STEP, ArrowUp: -STEP }[event.key];
      const across = event.key === "ArrowLeft" || event.key === "ArrowRight";
      if (by !== undefined && across === stop.matches(".scene") && stop.matches(".scene, .layer")) {
        event.preventDefault();
        (across ? stretchScene : stretchLayer)(key, by);
      }

      return;
    }

    if ((event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) && openMenu(event)) return;

    // A narrow box shows one column: a move across shows the next one, and keeps the row.
    if (narrow && (event.key === "ArrowLeft" || event.key === "ArrowRight") && stop.dataset.col !== "0") {
      event.preventDefault();
      const row = Number(stop.dataset.row);
      turn(event.key === "ArrowRight" ? 1 : -1);
      void tick().then(() => stopAt(row, shown)?.focus());

      return;
    }

    const next = beside(stop, event.key);
    if (!next) return;

    event.preventDefault();
    next.focus();
  }

  function onfocusin(event: FocusEvent) {
    const stop = (event.target as HTMLElement).closest<HTMLElement>("[data-row]");
    if (!stop) return;

    const start = Number(stop.dataset.col);
    if (column < start || column >= start + Number(stop.dataset.span ?? 1)) column = start;

    if (stop === reached) return;
    reached?.setAttribute("tabindex", "-1");
    stop.setAttribute("tabindex", "0");
    reached = stop;
  }

  // A pointer goes straight to the text of a card, or of a place without one. The band of a card
  // selects it instead: the card takes the focus, and a key acts on it. In a narrow box nothing is
  // edited in place: a tap opens the dialog of what it touches.
  function onclick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.closest("button, textarea")) return;

    if (narrow) {
      const stop = target.closest<HTMLElement>("[data-key]");
      if (stop) open(stop.dataset.key!);

      return;
    }

    const cell = target.closest<HTMLElement>(".cell[data-key]");
    if (cell && !target.closest(".band")) editing = cell.dataset.key;
  }

  // Two clicks open the dialog of a beat, a scene or a layer, and give a grip its default back.
  function ondblclick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const grip = target.closest<HTMLElement>("[data-grip]");
    if (grip) return (grip.dataset.grip === "width" ? stretchScene : stretchLayer)(grip.dataset.id!, undefined);

    const header = target.closest<HTMLElement>("[data-key]:not(.cell)");
    if (header && !narrow && !target.closest("button")) open(header.dataset.key!);
  }

  // A grip stretches the column or the track it ends, while the pointer holds it. In a narrow box a
  // finger starts a swipe instead.
  function onpointerdown(event: PointerEvent) {
    if (narrow) {
      if (event.pointerType !== "mouse") swipe = { x: event.clientX, y: event.clientY };

      return;
    }

    const grip = (event.target as HTMLElement).closest<HTMLElement>("[data-grip]");
    if (!grip || event.button !== 0) return;

    const axis = grip.dataset.grip as "width" | "height";
    const box = grip.parentElement!.getBoundingClientRect();
    const [from, size] = axis === "width" ? [event.clientX, box.width] : [event.clientY, box.height];
    drag = { id: grip.dataset.id!, axis, from, size: (size / rem()) * 4 };
    grip.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onpointermove(event: PointerEvent) {
    if (!drag) return;

    const moved = (((drag.axis === "width" ? event.clientX : event.clientY) - drag.from) / rem()) * 4;
    const [least, most] = LIMITS[drag.axis];
    stretching = { id: drag.id, size: Math.min(most, Math.max(least, Math.round(drag.size + moved))) };
  }

  function onpointerup(event: PointerEvent & { currentTarget: HTMLElement }) {
    if (drag && stretching)
      (drag.axis === "width" ? composer.resizeScene : composer.resizeLayer)(drag.id, stretching.size);

    // A finger that went across more than down asks for the next scene, in the way the text reads.
    if (swipe) {
      const [across, down] = [event.clientX - swipe.x, event.clientY - swipe.y];
      const forth = across < 0 === (getComputedStyle(event.currentTarget).direction === "ltr");
      if (Math.abs(across) >= SWIPE && Math.abs(across) > 2 * Math.abs(down)) turn(forth ? 1 : -1);
    }

    drag = stretching = swipe = undefined;
  }

  // The Tab key reaches the grid through one header or card. The first one in view stands in until
  // the focus has been somewhere, and again when what it last reached is gone or out of view.
  $effect(() => {
    void [content, narrow, shown, named];
    if (reached?.isConnected && reached.checkVisibility()) return;

    reached?.setAttribute("tabindex", "-1");
    reached = Array.from(grid?.querySelectorAll<HTMLElement>("[data-row]") ?? []).find((stop) =>
      stop.checkVisibility()
    );
    reached?.setAttribute("tabindex", "0");
  });
</script>

<div class="timeline" bind:clientWidth={width} onscroll={(event) => (scrolled = event.currentTarget.scrollTop > 0)}>
  <!-- svelte-ignore a11y_interactive_supports_focus: a grid gives the focus to one of its headers or cards. -->
  <div
    bind:this={grid}
    class="grid"
    class:named
    role="grid"
    aria-label={text.label}
    style:--template={template}
    style:--head="{head}px"
    {onkeydown}
    {onfocusin}
    {onclick}
    {ondblclick}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={() => (drag = stretching = swipe = undefined)}
    oncontextmenu={openMenu}
  >
    <!-- The names of the beats stay in view. What describes them scrolls away with the tracks. -->
    <div class="row names" role="row" bind:offsetHeight={head}>
      <div class="corner" role="presentation"></div>
      {#each content.beats as beat, index (beat.id)}
        {@const name = beatName(beat, index)}
        {@const span = Math.max(beat.scenes.length, 1)}
        {@const start = starts[index]!.column}
        <Described description={beat.description} hidden={scrolled}>
          {#snippet trigger(attributes)}
            <div
              {...attributes}
              class="beat"
              class:shown={shown >= start && shown < start + span}
              role="columnheader"
              aria-label={name}
              aria-colspan={span}
              aria-haspopup="menu"
              tabindex="-1"
              style:--span={span}
              data-row="0"
              data-col={start}
              data-span={span}
              data-key={beat.id}
            >
              <div class="pin heading">
                <span class="title" class:untitled={!beat.title}>{name}</span>
                <span class="tools">
                  <IconButton
                    label={text.scenes.add}
                    title={text.scenes.add}
                    variant="ghost"
                    tone="neutral"
                    size="sm"
                    tabindex={-1}
                    disabled={beat.scenes.length >= LIMITS.items}
                    onclick={() => added(composer.addScene(beat.id, beat.scenes.length))}
                  >
                    <Plus size="var(--icon-size-sm)" aria-hidden="true" />
                  </IconButton>
                </span>
              </div>
            </div>
          {/snippet}
        </Described>
      {/each}
      <div class="end" role="gridcell">
        <Button
          variant="ghost"
          tone="neutral"
          size="sm"
          tabindex={-1}
          data-row="0"
          data-col={columns + 1}
          disabled={content.beats.length >= LIMITS.items}
          onclick={() => added(composer.addBeat(content.beats.length))}
        >
          <Plus size="var(--icon-size-sm)" aria-hidden="true" />{text.beats.add}
        </Button>
      </div>
    </div>

    <div class="row about" role="presentation">
      <div class="corner"></div>
      {#each content.beats as beat, index (beat.id)}
        {@const span = Math.max(beat.scenes.length, 1)}
        {@const start = starts[index]!.column}
        <div class="described" class:shown={shown >= start && shown < start + span} style:--span={span}>
          {#if beat.description}<p class="pin description">{beat.description}</p>{/if}
        </div>
      {/each}
      <div class="end"></div>
    </div>

    <!-- The names of the scenes stay in view under those of the beats. -->
    <div class="row names scenes" role="row">
      <div class="corner" role="presentation"></div>
      {#each content.beats as beat, index (beat.id)}
        {#each beat.scenes as scene, place (scene.id)}
          {@const name = sceneName(scene, starts[index]!.before + place + 1)}
          {@const col = starts[index]!.column + place}
          <Described description={scene.description} hidden={scrolled}>
            {#snippet trigger(attributes)}
              <div
                {...attributes}
                class="scene"
                class:shown={shown === col}
                role="columnheader"
                aria-label={name}
                aria-haspopup="menu"
                tabindex="-1"
                data-row="1"
                data-col={col}
                data-key={scene.id}
              >
                <div class="heading">
                  <span class="title" class:untitled={!scene.title}>{name}</span>
                </div>
                <span class="grip" data-grip="width" data-id={scene.id} aria-hidden="true"></span>
              </div>
            {/snippet}
          </Described>
        {:else}
          <!-- A beat without a scene keeps its column, which offers the first one. -->
          <div class="scene" class:shown={shown === starts[index]!.column} role="gridcell">
            <Button
              variant="ghost"
              tone="neutral"
              size="sm"
              tabindex={-1}
              data-row="1"
              data-col={starts[index]!.column}
              onclick={() => added(composer.addScene(beat.id, 0))}
            >
              <Plus size="var(--icon-size-sm)" aria-hidden="true" />{text.scenes.add}
            </Button>
          </div>
        {/each}
      {/each}
      <div class="end" role="presentation"></div>
      <!-- A narrow box shows one scene: these move to the next one as a swipe does, and show the
           names of the layers over the cards. -->
      <div class="turn" role="gridcell">
        <IconButton
          label={text.scenes.previous}
          variant="ghost"
          tone="neutral"
          size="sm"
          disabled={shown <= 1}
          onclick={() => turn(-1)}
        >
          <ChevronLeft size="var(--icon-size-sm)" aria-hidden="true" />
        </IconButton>
        <IconButton
          label={text.scenes.next}
          variant="ghost"
          tone="neutral"
          size="sm"
          disabled={shown >= columns}
          onclick={() => turn(1)}
        >
          <ChevronRight size="var(--icon-size-sm)" aria-hidden="true" />
        </IconButton>
        <IconButton
          label={text.layers.names}
          variant="ghost"
          tone="neutral"
          size="sm"
          aria-pressed={named}
          onclick={() => (named = !named)}
        >
          <Layers size="var(--icon-size-sm)" aria-hidden="true" />
        </IconButton>
      </div>
    </div>

    <div class="row about" role="presentation">
      <div class="corner"></div>
      {#each content.beats as beat, index (beat.id)}
        {#each beat.scenes as scene, place (scene.id)}
          <div class="described" class:shown={shown === starts[index]!.column + place}>
            {#if scene.description}<p class="description">{scene.description}</p>{/if}
          </div>
        {:else}
          <div class="described" class:shown={shown === starts[index]!.column}></div>
        {/each}
      {/each}
      <div class="end"></div>
    </div>

    <div class="tracks" role="rowgroup">
      {#each content.layers as layer, line (layer.id)}
        {@const name = layerName(layer)}
        {@const height = heightOf(layer)}
        {@const edits = layer.kind === "notes" || layer.kind === "logline"}
        <!-- A track carries the color of its layer to its header and to its cards. -->
        <div
          class="row track {layer.kind}"
          role="row"
          style={customColorStyle(layer.color)}
          style:--height={height === undefined ? undefined : length(height)}
        >
          <div
            class="layer"
            role="rowheader"
            aria-label={name}
            aria-haspopup="menu"
            tabindex="-1"
            data-row={line + 2}
            data-col="0"
            data-key={layer.id}
          >
            <div class="block">
              <span class="title">{name}</span>
              <span class="kind">{layer.label || text.layers.kinds[layer.kind]}</span>
            </div>
            <span class="grip" data-grip="height" data-id={layer.id} aria-hidden="true"></span>
          </div>

          {#each content.beats as beat, index (beat.id)}
            {#each beat.scenes as scene, place (scene.id)}
              {@const cell = scene.cells.find((held) => held.layer === layer.id)}
              {@const key = `${scene.id}/${layer.id}`}
              {@const filled = written(cell)}
              {@const col = starts[index]!.column + place}
              <div
                class="cell"
                class:last={place === beat.scenes.length - 1}
                class:written={filled}
                class:empty={!filled && editing !== key}
                class:shown={shown === col}
                role="gridcell"
                aria-haspopup={filled && edits ? "menu" : undefined}
                tabindex="-1"
                data-row={line + 2}
                data-col={col}
                data-key={edits ? key : undefined}
              >
                {#if filled || editing === key}
                  <div class="card" class:editing={editing === key}>
                    <div class="band"></div>
                    <div class="body">
                      {#if editing === key && (layer.kind === "notes" || layer.kind === "logline")}
                        {@const kind = layer.kind}
                        {@const held = cell?.kind === kind ? cell.text : ""}
                        <Editor
                          value={held}
                          label={fill(text.cells.label, {
                            layer: name,
                            scene: sceneName(scene, starts[index]!.before + place + 1),
                          })}
                          maxlength={LIMITS[kind]}
                          wraps
                          breaks={kind === "notes"}
                          ondone={(wrote, move) => {
                            if (wrote !== held) composer.writeCell(scene.id, layer.id, kind, wrote);
                            void leave(key, move);
                          }}
                          onpast={composer.undo}
                        />
                      {:else if cell?.kind === "script"}
                        {@const { excerpt, count } = script(cell)}
                        <p class="text">{excerpt}</p>
                        <p class="count">{count}</p>
                      {:else if cell}
                        <p class="text">{cell.text.slice(0, EXCERPT)}</p>
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>
            {:else}
              <div class="cell last" class:shown={shown === starts[index]!.column} role="gridcell"></div>
            {/each}
          {/each}
          <div class="end" role="presentation"></div>
        </div>
      {/each}
    </div>

    <div class="foot" role="row">
      <div class="add" role="gridcell">
        <ActionMenu label={text.layers.add} items={addedLayers} controller={layerMenu} align="start">
          {#snippet trigger(attributes)}
            <Button
              {...attributes}
              variant="ghost"
              tone="neutral"
              size="sm"
              tabindex={-1}
              data-row={foot}
              data-col="0"
              disabled={content.layers.length >= LIMITS.layers}
            >
              <Plus size="var(--icon-size-sm)" aria-hidden="true" />{text.layers.add}
            </Button>
          {/snippet}
        </ActionMenu>
      </div>
    </div>
  </div>
</div>

<!-- The menu of a header or a card opens from a point: where the pointer asked for it, or under the
     item for a key. Nothing draws the point, and no reader finds it: the header or the card says it
     has a menu. -->
<ActionMenu label={chosen?.label ?? ""} items={chosen?.items ?? []} controller={menu} align="start">
  {#snippet trigger(attributes)}
    <button
      {...attributes}
      bind:this={anchor}
      class="anchor"
      type="button"
      tabindex="-1"
      aria-hidden="true"
      style:inset-inline-start="{chosen?.x ?? 0}px"
      style:inset-block-start="{chosen?.y ?? 0}px"
    ></button>
  {/snippet}
</ActionMenu>

<!-- A beat, a scene and a layer are each edited whole in a compact dialog, as a short form is. In a
     narrow box the dialog also holds a card, and everything else a writer can do with the item. -->
<Dialog
  controller={dialog}
  size="sm"
  title={edited?.kind === "card"
    ? edited.name
    : edited?.kind === "layer"
      ? text.layers.edit
      : edited?.kind === "scene"
        ? text.scenes.edit
        : text.beats.edit}
>
  {#if edited}
    {#key edited}
      <form id={formId} onsubmit={save}>
        {#if edited.kind === "layer"}
          {@const { layer, color } = edited}
          <Field label={text.layers.name}>
            {#snippet children(control)}
              <!-- svelte-ignore a11y_autofocus: a dialog opens on its first field. -->
              <Input
                {...control}
                name="name"
                value={layer.name}
                placeholder={text.layers.kinds[layer.kind]}
                maxlength={LIMITS.title}
                autofocus
              />
            {/snippet}
          </Field>
          <Field label={text.layers.label}>
            {#snippet children(control)}
              <Input
                {...control}
                name="label"
                value={layer.label ?? ""}
                placeholder={text.layers.kinds[layer.kind]}
                maxlength={LIMITS.title}
              />
            {/snippet}
          </Field>
          <ColorField legend={text.layers.color} name="color" controller={color} />
        {:else if edited.kind === "card"}
          {@const { name, holds, text: held } = edited}
          <!-- svelte-ignore a11y_autofocus: a dialog opens on its first field. -->
          {#if holds === "notes"}
            <Textarea
              name="text"
              value={held}
              aria-label={name}
              maxlength={LIMITS.notes}
              rows={6}
              autoSize
              autofocus
              onkeydown={saves}
            />
          {:else}
            <Input name="text" value={held} aria-label={name} maxlength={LIMITS.logline} autofocus />
          {/if}
        {:else}
          {@const { name, title, description } = edited}
          <Field label={text.fields.title}>
            {#snippet children(control)}
              <!-- svelte-ignore a11y_autofocus: a dialog opens on its first field. -->
              <Input {...control} name="title" value={title} placeholder={name} maxlength={LIMITS.title} autofocus />
            {/snippet}
          </Field>
          <Field label={text.fields.description}>
            {#snippet children(control)}
              <Textarea
                {...control}
                name="description"
                value={description}
                maxlength={LIMITS.description}
                rows={3}
                autoSize
                onkeydown={saves}
              />
            {/snippet}
          </Field>
        {/if}
      </form>

      {#if options.length > 0}
        <div class="options">
          {#each options as option (option.id)}
            <Button
              variant="ghost"
              tone={option.tone ?? "neutral"}
              disabled={option.disabled}
              onclick={() => {
                dialog.close();
                option.onSelect?.();
              }}
            >
              {option.label}
            </Button>
          {/each}
        </div>
      {/if}
    {/key}
  {/if}
  {#snippet actions()}
    <Button variant="outline" tone="neutral" onclick={dialog.close}>{text.actions.cancel}</Button>
    <Button type="submit" form={formId}>{text.actions.save}</Button>
  {/snippet}
</Dialog>

<style>
  /* The timeline takes the room its composer leaves and scrolls both ways inside it, so the names of
     its columns and its two scrollbars stay within reach. Its own width tells a narrow box from a
     wide one: it reads no size of the screen. */
  .timeline {
    /* The column of the layers, which a narrow box shortens, and the column of a scene. */
    --side: min(calc(var(--size-24) + var(--size-16)), 38cqi);
    --scene: calc(var(--size-24) + var(--size-24));
    flex: 1;
    container-type: inline-size;
    isolation: isolate;
    min-block-size: 0;
    overflow: auto;
    color: var(--color-text-primary);
    font: var(--text-ui);
  }

  /* One grid holds every row, so a header and its cards share a column, each at the width a writer
     stretched it to. The last column takes what the scenes leave. */
  .grid {
    display: grid;
    grid-template-columns: var(--template);
    inline-size: max-content;
    min-inline-size: 100%;
  }

  .tracks,
  .row,
  .foot {
    display: grid;
    grid-template-columns: subgrid;
    grid-column: 1 / -1;
  }

  /* A track is as tall as what it holds at least, and as a writer stretched it. */
  .track {
    min-block-size: var(--height);
  }

  /* The names of the columns stay in view while the tracks scroll: the beats', then the scenes'
     under them. What describes a column scrolls away with the tracks, which leaves them the room. */
  .names {
    position: sticky;
    z-index: 1;
    inset-block-start: 0;
  }

  .names.scenes {
    inset-block-start: var(--head);
  }

  /* Glass, as a sticky bar: the lamp shines through the names, and what scrolls under them frosts.
     A row of names frosts on a layer under its cells: a frost of its own would hide them from the
     corner's, which blurs the names that pass under it. */
  .names::before {
    position: absolute;
    z-index: -1;
    inset: 0;
    content: "";
  }

  .corner,
  .layer {
    position: sticky;
    z-index: 1;
    inset-inline-start: 0;
  }

  /* The names hold over whatever scrolls by, so they darken to the canvas under their frost, as a
     bar at the foot of a page does. What describes a column darkens as they do, so the head reads
     as one surface before anything scrolls. */
  .names::before,
  .corner,
  .layer {
    -webkit-backdrop-filter: blur(var(--blur-lg));
    backdrop-filter: blur(var(--blur-lg));
  }

  .names::before,
  .corner,
  .layer,
  .about {
    background: color-mix(in oklab, var(--color-surface-canvas) var(--color-mix-12), transparent);
  }

  /* What scrolls passes under the names, the corner of its own row included. */
  .about,
  .tracks {
    position: relative;
    z-index: 0;
  }

  /* Nothing shares the last row, so its action takes the room its label needs. */
  .add {
    position: sticky;
    grid-column: 1 / -1;
    justify-self: start;
    inset-inline-start: 0;
  }

  .corner,
  .layer,
  .beat,
  .scene,
  .described,
  .cell {
    box-sizing: border-box;
    min-inline-size: 0;
  }

  .beat,
  .described {
    grid-column: span var(--span, 1);
  }

  /* What takes the focus scrolls into view clear of what stays over it: the layers, and the names
     of the columns over a card. A beat wider than the screen would otherwise slide under the layers. */
  .beat,
  .scene,
  .cell {
    scroll-margin-inline-start: var(--side);
  }

  .cell {
    scroll-margin-block-start: calc(2 * var(--head));
  }

  /* The names draw no line: a name and the room around it mark a column. Under them, a scene ends
     at a hairline and a beat at a stronger line, and the tracks part with the room around their
     cards alone, which marks a line less than a column. The column of the layers ends as a beat
     does, so the tracks that scroll under it are cut at a line. */
  .layer,
  .cell {
    border-inline-end: var(--border-width-thin) solid var(--color-border-divider);
  }

  .layer,
  .cell.last {
    border-inline-end-width: var(--border-width-strong);
  }

  .beat,
  .scene,
  .add,
  .end {
    padding-inline: var(--space-3) var(--space-1);
    padding-block: var(--space-1);
  }

  .described {
    padding-inline: var(--space-3) var(--space-1);
  }

  /* A heading is as tall as the action it shows under the pointer, so showing it moves nothing. */
  .heading {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: var(--control-height-sm);
  }

  .end {
    display: flex;
    align-items: center;
  }

  /* The name of a beat and what describes it follow the screen while its scenes scroll by. The name
     keeps the width of one scene, so its action stays beside it. The description takes the width of
     its beat, up to a measure that reads and to the room the layers leave on the screen. */
  .pin {
    position: sticky;
    inset-inline-start: calc(var(--side) + var(--space-3));
    max-inline-size: calc(var(--scene) - var(--size-3));
  }

  .pin.description {
    max-inline-size: min(var(--layout-readable-measure), calc(100cqi - var(--side) - var(--size-6)));
  }

  .title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* A beat and a scene name columns. */
  .beat,
  .scene {
    font: var(--text-ui-strong);
  }

  .title.untitled {
    color: var(--color-text-muted);
  }

  .description,
  .kind,
  .count {
    font: var(--text-meta);
  }

  .description,
  .text,
  .count {
    margin: 0;
  }

  /* What describes a column shows whole, over the lines it takes and the ones its writer broke. */
  .description {
    padding-block-end: var(--space-2);
    color: var(--color-text-secondary);
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  /* The action of a beat takes its room under the pointer and with the focus, so a name keeps the
     width of its column until then. It always shows where nothing hovers. */
  .tools {
    display: none;
  }

  .beat:focus-within .tools {
    display: flex;
  }

  @media (hover: hover) {
    .beat:hover .tools {
      display: flex;
    }
  }

  @media (hover: none) {
    .tools {
      display: flex;
    }
  }

  /* A narrow box alone moves from scene to scene with buttons. */
  .turn {
    display: none;
  }

  /* A grip ends a column or a track, and stretches it under the pointer. It stays inside the header
     it ends, since the next header would cover what reaches past it, and shows as a line once the
     pointer finds it. */
  .grip {
    position: absolute;
    touch-action: none;
  }

  .scene {
    position: relative;
  }

  .scene .grip {
    cursor: col-resize;
    inset-block: 0;
    inset-inline-end: 0;
    inline-size: var(--size-1-5);
  }

  .layer .grip {
    cursor: row-resize;
    inset-block-end: 0;
    inset-inline: 0;
    block-size: var(--size-1-5);
  }

  @media (hover: hover) {
    .grip:hover {
      background: var(--color-border-selected);
    }
  }

  /* The header of a track is its first block: its name on one plain fill of its color, the one place
     of a track that fills with it. */
  .layer,
  .cell {
    display: flex;
    flex-direction: column;
    padding: var(--space-1);
  }

  /* A track is quiet, as the rest of the interface is: a card takes a veil of the neon of its color,
     as a message box takes one of its hue's, and one veil more under the pointer and once selected.
     The color shows at full strength where it guides the eye: in the band of each card. The name of
     a track stands on the lit tint of its color, as a label does: one fill, between the veil of a
     card and the color of its band. Without a color, the neon is the text of a neutral label, so a
     card takes the veil every surface does. */
  .track {
    --veil: color-mix(in oklab, var(--color-ink-custom) var(--color-mix-2), transparent);
    --veil-lit: color-mix(in oklab, var(--color-ink-custom) var(--color-mix-4), transparent);
  }

  /* The name stands level with the text of a card, which a band sets lower. */
  .block {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-1);
    border-radius: var(--radius-md);
    background: var(--color-tint-custom-lit);
    padding: var(--space-4) var(--space-3) var(--space-2);
  }

  .block .title {
    flex: none;
  }

  /* Text on a tint is never muted. */
  .kind,
  .count {
    color: var(--color-text-secondary);
  }

  /* A card is what a layer holds for a scene: a band in the exact color of its layer, over the text
     on the veil of its track. It fills its place on the track, so the cards of a track line up. */
  .card {
    display: flex;
    position: relative;
    flex: 1;
    flex-direction: column;
    border-radius: var(--radius-md);
    background: var(--veil);
    overflow: clip;
  }

  /* The band takes the lit tint under the exact color: a layer without a color has none to show.
     It selects its card. */
  .band {
    flex: none;
    cursor: pointer;
    background: linear-gradient(var(--color-mark-custom), var(--color-mark-custom)), var(--color-tint-custom-lit);
    block-size: var(--size-3);
  }

  .body {
    display: flex;
    flex: 1;
    flex-direction: column;
    padding: var(--space-2) var(--space-3);
  }

  .cell[data-key] .body,
  .cell.empty[data-key] {
    cursor: text;
  }

  /* A card shows the first lines of a long text. */
  .text {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--lines);
    line-clamp: var(--lines);
    overflow: hidden;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  .track.notes {
    --lines: 8;
  }

  .track.script {
    --lines: 3;
  }

  .script .text {
    color: var(--color-text-secondary);
  }

  /* A card lights under the pointer, and stays lit once selected: the pointer leaves, and the card
     still tells which one a key acts on. A place without a card shows where one would stand. */
  .cell[data-key]:focus .card {
    background: var(--veil-lit);
  }

  @media (hover: hover) {
    .cell[data-key]:hover .card {
      background: var(--veil-lit);
    }

    .cell.empty[data-key]:hover::after {
      background: var(--color-surface-glass-hover);
    }
  }

  .cell.empty[data-key]::after {
    flex: 1;
    border-radius: var(--radius-md);
    content: "";
  }

  /* What is edited is a field in focus: its well, and its line. */
  .cell .card.editing {
    background: var(--color-control-surface-focus);
  }

  .card.editing::after {
    position: absolute;
    inset: 0;
    box-shadow: inset 0 0 0 var(--border-width-strong) var(--color-control-border-focus);
    border-radius: inherit;
    pointer-events: none;
    content: "";
  }

  /* The focus ring is for the keyboard, and draws inside what holds it: an outline would cross the
     names a card scrolls under. */
  [data-row]:focus-visible,
  .cell:focus {
    outline: none;
  }

  :is(.beat, .scene, .layer):focus-visible,
  :global(button)[data-row]:focus-visible {
    box-shadow: inset 0 0 0 var(--focus-ring-width) var(--color-focus-ring);
  }

  .cell:focus-visible .card::after,
  .cell.empty:focus-visible::after {
    box-shadow: inset 0 0 0 var(--focus-ring-width) var(--color-focus-ring);
  }

  .cell:focus-visible .card::after {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    content: "";
  }

  /* The menu of a header or a card opens from a point of the screen, which nothing draws. */
  .anchor {
    position: fixed;
    opacity: 0;
    margin: 0;
    border: 0;
    padding: 0;
    inline-size: 0;
    block-size: 0;
    pointer-events: none;
  }

  /* The fields of a dialog are siblings, and so are the other things it offers in a narrow box. */
  form,
  .options {
    display: grid;
    gap: var(--space-4);
  }

  .options {
    margin-block-start: var(--space-8);
  }

  /* A narrow box shows one scene at a time, at its whole width, and never scrolls across: a finger
     that goes across is a swipe, which the page must not take for a scroll. */
  @container not (min-width: 48rem) {
    .grid,
    .tracks,
    .row,
    .foot {
      display: block;
    }

    .grid {
      inline-size: auto;
      min-inline-size: 0;
      touch-action: pan-y;
    }

    .corner,
    .end,
    .tools,
    .grip,
    :is(.beat, .scene, .described, .cell):not(.shown) {
      display: none;
    }

    /* The names of the scenes share their row with the buttons that move from one to the next. */
    .names.scenes {
      display: flex;
      align-items: center;
    }

    .scene {
      flex: 1;
    }

    .turn {
      display: flex;
      padding-inline-end: var(--space-1);
    }

    .pin,
    .pin.description {
      max-inline-size: none;
    }

    /* Each track keeps the room of its name, so the names line up with what they name, and a place
       without a card shows where a tap writes one: no pointer hovers it here. */
    .track {
      display: flex;
      position: relative;
      min-block-size: var(--size-16);
    }

    .cell {
      flex: 1;
      border-inline-end-width: 0;
    }

    .cell.empty[data-key]::after {
      background: var(--color-surface-glass-hover);
    }

    /* The names of the layers are out of view until asked for. They then show over the cards, each
       on the track it names, and hide what they cover. */
    .layer {
      display: none;
      position: absolute;
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
      inset-block: 0;
      border-inline-end-width: 0;
      background: var(--color-surface-canvas);
      inline-size: var(--side);
    }

    .named .layer {
      display: flex;
    }
  }

  @media (forced-colors: active) {
    [data-row]:focus-visible,
    .cell:focus {
      outline: var(--focus-ring-width) solid Highlight;
      outline-offset: calc(-1 * var(--focus-ring-width));
    }

    .card,
    .block {
      border: var(--border-width-thin) solid CanvasText;
    }
  }
</style>
