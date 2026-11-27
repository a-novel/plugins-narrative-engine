<!--
@component
The field a card turns into while it is edited. It takes the place and the text style of what it
edits, and reports once: on a key that leaves it, or when the focus goes elsewhere.

It keeps its own history of the typing, in place of the browser's: undo takes back a word, a pause
or a paste at a time, then hands over to the edits made before this one.
-->
<script lang="ts" module>
  /** Where the focus goes once an edit ends: back to the item, or on to the one beside it. */
  export type Move = "stay" | "next" | "previous";
</script>

<script lang="ts">
  interface Props {
    /** The text to edit. */
    value: string;
    /** Names the field for assistive technology. */
    label: string;
    placeholder?: string;
    maxlength: number;
    /** Wraps the text over the lines of a cell. A title stays on one line. */
    wraps?: boolean;
    /** Lets Enter break the line. Control or Command with Enter then ends the edit. */
    breaks?: boolean;
    /** Receives the text when the edit ends. Without a move, the focus already went elsewhere. */
    ondone: (text: string, move?: Move) => void;
    /** Called once undo has taken back all the typing of this edit and is asked for more. */
    onpast?: () => void;
  }

  let { value, label, placeholder, maxlength, wraps = false, breaks = false, ondone, onpast }: Props = $props();

  type Field = HTMLInputElement | HTMLTextAreaElement;

  // How many states of the text an edit can go back to, and the pause that starts a new one.
  const KEPT = 100;
  const PAUSE = 1000;

  let done = false;

  // The texts undo goes back to and redo returns to, oldest first, and the text before the input
  // being typed. They live as long as the field, and are never drawn.
  const past: string[] = [];
  const future: string[] = [];
  let before = "";
  let last = { kind: "", at: 0 };

  /**
   * Keeps the text an input replaces, at the points a writer goes back to: after a pause, at the end
   * of a word, when typing turns into deleting, and before a paste, a cut or a line break.
   */
  function oninput(event: Event) {
    const { inputType, data, timeStamp } = event as InputEvent;
    const kind = inputType === "insertText" ? "type" : inputType.startsWith("deleteContent") ? "delete" : "";
    const ends = kind === "type" && /\s/.test(data ?? "");

    if (kind === "" || kind !== last.kind || ends || timeStamp - last.at > PAUSE) {
      past.push(before);
      if (past.length > KEPT) past.shift();
    }

    last = { kind, at: timeStamp };
    future.length = 0;
  }

  /** Moves the text one state back or forth. With nothing of this edit left to take back, it ends. */
  function travel(field: Field, forth: boolean) {
    const [from, to] = forth ? [future, past] : [past, future];
    const text = from.pop();

    if (text !== undefined) {
      to.push(field.value);
      field.value = text;
      // The next input starts a state of its own.
      last = { kind: "", at: 0 };
    } else if (!forth) {
      end(field, "stay");
      onpast?.();
    }
  }

  function end(field: Field, move?: Move) {
    // Removing the field can blur it, after the key that ended the edit.
    if (done) return;
    done = true;

    // A pasted text can break a line that Enter cannot.
    ondone(breaks ? field.value : field.value.replace(/\s*[\r\n]+\s*/g, " "), move);
  }

  function onkeydown(event: KeyboardEvent & { currentTarget: Field }) {
    // A key that composes a character belongs to the input method.
    if (event.isComposing) return;

    // Undo and redo are the composer's: the browser's own would stop at the edge of the field.
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (key === "z" || key === "y")) {
      event.preventDefault();
      travel(event.currentTarget, key === "y" || event.shiftKey);

      return;
    }

    const submits = event.key === "Enter" && (!breaks || event.ctrlKey || event.metaKey);
    if (event.key === "Escape" || submits) {
      event.preventDefault();
      end(event.currentTarget, "stay");
    } else if (event.key === "Tab") {
      event.preventDefault();
      end(event.currentTarget, event.shiftKey ? "previous" : "next");
    }
  }

  function focus(field: Field) {
    field.focus();
    // A title is replaced more often than amended. A cell is continued.
    if (wraps) field.setSelectionRange(field.value.length, field.value.length);
    else field.select();
  }
</script>

{#if wraps}
  <textarea
    {value}
    {placeholder}
    {maxlength}
    aria-label={label}
    {onkeydown}
    onbeforeinput={(event) => (before = event.currentTarget.value)}
    {oninput}
    onblur={(event) => end(event.currentTarget)}
    {@attach focus}></textarea>
{:else}
  <input
    {value}
    {placeholder}
    {maxlength}
    aria-label={label}
    {onkeydown}
    onbeforeinput={(event) => (before = event.currentTarget.value)}
    {oninput}
    onblur={(event) => end(event.currentTarget)}
    {@attach focus}
  />
{/if}

<style>
  /* The field is the text it edits: what holds it draws the well and the focus. */
  input,
  textarea {
    display: block;
    box-sizing: border-box;
    margin: 0;
    outline: none;
    border: 0;
    background: none;
    padding: 0;
    inline-size: 100%;
    min-inline-size: 0;
    color: var(--color-control-text);
    font: inherit;
  }

  /* The field of a card fills it, and grows with its text where a browser can size a field so. */
  textarea {
    flex: 1;
    field-sizing: content;
    resize: none;
  }

  ::placeholder {
    opacity: 1;
    color: var(--color-control-placeholder);
  }
</style>
