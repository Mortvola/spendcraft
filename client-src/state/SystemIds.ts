class SystemIds {
  #systemGroupId: number | null = null;

  #unassignedId: number | null = null;

  #fundingPoolId: number | null = null;

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
}

export default SystemIds;
