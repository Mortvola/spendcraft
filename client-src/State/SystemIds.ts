class SystemIds {
  #systemGroupId: number | null = null;

  #loansGroupId: number | null = null;

  set systemGroupId(id: number) {
    this.#systemGroupId = id;
  }

  get systemGroupId(): number {
    if (this.#systemGroupId === null) {
      throw new Error('systemGroupId is null');
    }

    return this.#systemGroupId;
  }

  set loansGroupId(id: number) {
    this.#loansGroupId = id;
  }

  get loansGroupId(): number {
    if (this.#loansGroupId === null) {
      throw new Error('loansGroupId is null');
    }

    return this.#loansGroupId;
  }
}

export default SystemIds;
