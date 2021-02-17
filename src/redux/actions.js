import {
  REQUEST_REPORT_DATA,
  RECEIVE_REPORT_DATA,
  RECEIVE_PLANS,
  RECEIVE_PLAN,
  UPDATE_PLAN_ITEM,
} from './actionTypes';

const receivePlans = (plans) => ({
  type: RECEIVE_PLANS,
  plans,
});

const fetchPlans = () => (
  (dispatch) => (
    fetch('/funding_plans')
      .then(
        (response) => response.json(),
        (error) => console.log('fetch error: ', error),
      )
      .then(
        (json) => dispatch(receivePlans(json)),
      )
  )
);

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

const requestReportData = () => ({
  type: REQUEST_REPORT_DATA,
});

const receiveReportData = (reportType, data) => ({
  type: RECEIVE_REPORT_DATA,
  reportType,
  data,
});

const report = (reportType) => (
  (dispatch) => {
    dispatch(requestReportData());

    switch (reportType) {
      case 'netWorth':
        return (
          fetch('/reports/networth')
            .then(
              (response) => response.json(),
              (error) => console.log('fetch error: ', error),
            )
            .then(
              (json) => {
                dispatch(receiveReportData(reportType, json));
              },
            )
        );

      default:
        return null;
    }
  }
);

const updatePlanItem = (category) => ({
  type: UPDATE_PLAN_ITEM,
  category,
});

export {
  report,
  fetchPlans,
  fetchPlan,
  updatePlanItem,
};
