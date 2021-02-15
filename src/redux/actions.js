import {
  RECEIVE_CATEGORY_BALANCES,
  RECEIVE_TRANSACTION_CATEGORIES,
  RECEIVE_SYSTEM_IDS,
  SET_VIEW,
  REQUEST_REPORT_DATA,
  RECEIVE_REPORT_DATA,
  RECEIVE_USER,
  RECEIVE_PLANS,
  RECEIVE_PLAN,
  SHOW_PLAID_LINK,
  HIDE_PLAID_LINK,
  ADD_INSTITUTION,
  ACCOUNT_SYNCED,
  UPDATE_PLAN_ITEM,
  ACCOUNT_REFRESHING,
} from './actionTypes';

const addInstitution = (institution) => ({
  type: ADD_INSTITUTION,
  institution,
});

const receiveSystemIds = (systemIds) => ({
  type: RECEIVE_SYSTEM_IDS,
  ...systemIds,
});

const showPlaidLink = () => (
  (dispatch) => {
    fetch('/user/link_token')
      .then((response) => {
        if (response.ok) {
          return response.json();
        }

        throw new Error('invalid response');
      })
      .then((response) => {
        dispatch({
          type: SHOW_PLAID_LINK,
          linkToken: response.linkToken,
          updateMode: false,
        });
      })
      .catch(() => null);
  }
);

const hidePlaidLink = () => ({
  type: HIDE_PLAID_LINK,
});

const receiveCategoryBalances = (balances) => ({
  type: RECEIVE_CATEGORY_BALANCES,
  balances,
});

const receiveTransactionCategories = (transCategories) => ({
  type: RECEIVE_TRANSACTION_CATEGORIES,
  transCategories,
});

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

const accountSynced = (institutionId, accountId, balance, syncDate) => ({
  type: ACCOUNT_SYNCED,
  institutionId,
  accountId,
  balance,
  syncDate,
});

const updatePlanItem = (category) => ({
  type: UPDATE_PLAN_ITEM,
  category,
});

const accountRefreshing = (institutionId, accountId, refreshing) => ({
  type: ACCOUNT_REFRESHING,
  institutionId,
  accountId,
  refreshing,
});

const refreshAccount = (institutionId, accountId) => (
  (dispatch) => {
    dispatch(accountRefreshing(institutionId, accountId, true));

    fetch(`/institution/${institutionId}/accounts/${accountId}/transactions/sync`, {
      method: 'POST',
      headers: {
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }
        dispatch(accountRefreshing(institutionId, accountId, false));
        return response.json();
      })
      .then((json) => {
        const { categories, accounts } = json;
        if (categories && categories.length > 0) {
          dispatch(receiveCategoryBalances(categories));
        }

        if (accounts) {
          dispatch(accountSynced(
            institutionId, accountId, accounts[0].balance, accounts[0].syncDate,
          ));
        }
      })
      .catch((error) => {
        console.log(error);
        dispatch(accountRefreshing(institutionId, accountId, false));
      });
  }
);

export {
  fetchUser,
  addInstitution,
  receiveCategoryBalances,
  receiveTransactionCategories,
  receiveSystemIds,
  navigate,
  report,
  fetchPlans,
  fetchPlan,
  showPlaidLink,
  hidePlaidLink,
  accountSynced,
  updatePlanItem,
  refreshAccount,
};
