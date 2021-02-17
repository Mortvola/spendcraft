import {
  SET_VIEW,
  REQUEST_REPORT_DATA,
  RECEIVE_REPORT_DATA,
  RECEIVE_USER,
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

const setView = (view) => ({
  type: SET_VIEW,
  view,
});

const navigate = (eventKey) => (
  (dispatch, getState) => {
    const state = getState();
    switch (eventKey) {
      case 'home':
        if (state.selections.view === 'home') {
          dispatch(setView(eventKey));
          if (state.categoryTree.unassignedId !== null) {
            // dispatch(selectCategory(state.categoryTree.unassignedId));
          }
        }
        else {
          dispatch(setView(eventKey));
          if (state.selections.selectedCategoryId !== null) {
            // dispatch(selectCategory(state.selections.selectedCategoryId));
          }
          else if (state.categoryTree.unassignedId !== null) {
            // dispatch(selectCategory(state.categoryTree.unassignedId));
          }
        }

        break;

      case 'accounts':
        dispatch(setView(eventKey));
        if (state.selections.selectedAccountId !== null
          && state.selections.accountTracking !== null) {
          // dispatch(selectAccount(
          //   state.selections.selectedAccountId,
          //   state.selections.accountTracking,
          // ));
        }

        break;

      case 'reports':
        dispatch(setView(eventKey));

        break;

      case 'plans':
        dispatch(fetchPlans());
        dispatch(setView(eventKey));

        break;

      case 'logout':
        dispatch(setView(eventKey));

        break;

      default:
        break;
    }
  }
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

const receiveUser = (user) => ({
  type: RECEIVE_USER,
  user,
});

const fetchUser = () => (
  (dispatch) => (
    fetch('/user')
      .then(
        (response) => response.json(),
        (error) => console.log('fetch error: ', error),
      )
      .then(
        (json) => dispatch(receiveUser(json.username)),
      )
  )
);

const updatePlanItem = (category) => ({
  type: UPDATE_PLAN_ITEM,
  category,
});

export {
  fetchUser,
  navigate,
  report,
  fetchPlans,
  fetchPlan,
  updatePlanItem,
};
