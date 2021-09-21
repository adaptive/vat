export class Counter {
  constructor(state, env) {
    this.state = state;

    this.state.blockConcurrencyWhile(async () => {
      let stored = await this.state.storage.get("value");
      this.value = stored || 0;
    });
  }

  async fetch(request) {
    let currentValue = this.value;
    currentValue = ++this.value;
    await this.state.storage.put("value", this.value);
    return new Response(currentValue);
  }
}
