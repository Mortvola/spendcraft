import type { AutoAssignmentWriteRequest, AutoAssignmentResponse } from
  '../../common/ResponseTypes';
import { decodeCentFundingRules, encodeCentFundingRules, type CentFundingRule } from '../monetary';
import Http from '@mortvola/http';
import { observable, runInAction } from 'mobx';
import { AutoAssignmentInterface, AutoAssignmentProps, AutoAssignmentRule, StoreInterface } from
  './Types';

// Null remains the legacy fixed-dollar mode on reads; requests use boolean modes.
export const decodeAutoAssignmentRules = (rules: AutoAssignmentProps[
  'categories']): AutoAssignmentRule[] => rules.map(rule => {
  if (rule.percentage !== true && rule.percentage !== false && rule
    .percentage !== null) throw new Error('Invalid auto-assignment mode');
  const [decoded] = decodeCentFundingRules([rule.percentage === true ? rule : { ...rule,
    percentage: false }]);
  return decoded.percentage
    ? { ...decoded, id: rule.id }
    : { ...decoded, id: rule.id, percentage: rule.percentage === null ? null : false };
});

export const encodeAutoAssignmentRules = (rules: readonly AutoAssignmentRule[
  ]): AutoAssignmentWriteRequest['categories'] => {
  const normalized = rules.map<CentFundingRule>(rule => {
    if (rule.percentage !== true && rule.percentage !== false && rule
      .percentage !== null) throw new Error('Invalid auto-assignment mode');
    return rule.percentage === true ? rule : { ...rule, percentage: false };
  });
  return encodeCentFundingRules(normalized).map((rule, index) => ({ ...rule, id: rules[index]
    .id }));
};

class AutoAssignment implements AutoAssignmentInterface {
  id: number;

  @observable
  accessor name: string;

  @observable
  accessor searchStrings: string[] = [];

  @observable
  accessor categories: AutoAssignmentRule[] = []

  store: StoreInterface;

  constructor(props: AutoAssignmentProps, store: StoreInterface) {
    this.id = props.id
    this.name = props.name

    this.searchStrings = props.searchStrings
    this.categories = decodeAutoAssignmentRules(props.categories)

    this.store = store;
  }

  async update(props: {
    name: string,
    searchStrings: string[],
    categories: AutoAssignmentRule[],
  }) {
    const response = await Http.patch<AutoAssignmentWriteRequest, AutoAssignmentResponse>(
      `/api/v1/auto-assignments/${this.id}`, {
      name: props.name,
      searchStrings: props.searchStrings,
      categories: encodeAutoAssignmentRules(props.categories),
    })

    if (response.ok) {
      const { data: body } = await response.body();
      if (!body) throw new Error('Invalid auto-assignment response');

      const categories = decodeAutoAssignmentRules(body.categories);
      runInAction(() => {
        this.name = body.name;
        this.searchStrings = body.searchStrings;
        this.categories = categories;
      })
    }
  }

  async delete(): Promise<void> {
    const response = await Http.delete(`/api/v1/auto-assignments/${this.id}`)

    if (response.ok) {
      runInAction(() => {
        this.store.autoAssignments.remove(this.id);
      })
    }
  }
}

export default AutoAssignment;
