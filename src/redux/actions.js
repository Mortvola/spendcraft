import {
  RECEIVE_PLAN,
  UPDATE_PLAN_ITEM,
} from './actionTypes';

const receivePlan = (plan) => ({
  type: RECEIVE_PLAN,
  plan,
});

const fetchPlan = (planId) => (
  (dispatch) => (
    fetch(`/funding_plan/${planId}/full`)
      .then(
        (response) => response.json(),
        (error) => console.log('fetch error: ', error),
      )
      .then(
        (json) => dispatch(receivePlan(json)),
      )
  )
);

const updatePlanItem = (category) => ({
  type: UPDATE_PLAN_ITEM,
  category,
});

export {
  fetchPlan,
  updatePlanItem,
};
