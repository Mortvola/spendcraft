class SystemIds {
  #systemGroupId: number | null = null;

  #unassignedId: number | null = null;

  #fundingPoolId: number | null = null;

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

  set unassignedId(id: number) {
    this.#unassignedId = id;
  }

  get unassignedId(): number {
    if (this.#unassignedId === null) {
      throw new Error('unassignedId is null');
    }

    return this.#unassignedId;
  }

  set fundingPoolId(id: number) {
    this.#fundingPoolId = id;
  }

  get fundingPoolId(): number {
    if (this.#fundingPoolId === null) {
      throw new Error('fundingPoolId is null');
    }

    return this.#fundingPoolId;
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
