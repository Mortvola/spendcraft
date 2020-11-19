import {
  ADD_GROUP,
  UPDATE_GROUP,
  DELETE_GROUP,
  REQUEST_GROUPS,
  RECEIVE_GROUPS,
  ADD_CATEGORY,
  UPDATE_CATEGORY,
  DELETE_CATEGORY,
  REQUEST_TRANSACTIONS,
  RECEIVE_TRANSACTIONS,
  REQUEST_INSTITUTIONS,
  RECEIVE_INSTITUTIONS,
  RECEIVE_CATEGORY_BALANCES,
  RECEIVE_TRANSACTION_CATEGORIES,
  SELECT_CATEGORY,
  SELECT_ACCOUNT,
  RECEIVE_SYSTEM_IDS,
  RECEIVE_ACCOUNT_BALANCES,
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

const addGroup = (group) => ({
  type: ADD_GROUP,
  group,
});

const updateGroup = (group) => ({
  type: UPDATE_GROUP,
  group,
});

const deleteGroup = (group) => ({
  type: DELETE_GROUP,
  group,
});

const requestGroups = () => ({
  type: REQUEST_GROUPS,
});

const receieveGroups = (groups) => ({
  type: RECEIVE_GROUPS,
  groups,
});

const receiveSystemIds = (systemIds) => ({
  type: RECEIVE_SYSTEM_IDS,
  ...systemIds,
});

const requestTransactions = () => ({
  type: REQUEST_TRANSACTIONS,
});

const receiveTransactions = (categoryId, transactions) => ({
  type: RECEIVE_TRANSACTIONS,
  categoryId,
  transactions,
});

const receiveAccountBalances = (balances) => ({
  type: RECEIVE_ACCOUNT_BALANCES,
  balances,
});

const setCategorySelection = (categoryId) => ({
  type: SELECT_CATEGORY,
  categoryId,
});

const selectCategory = (categoryId) => (
  (dispatch) => {
    dispatch(setCategorySelection(categoryId));
    dispatch(requestTransactions());

    return (
      fetch(`/category/${categoryId}/transactions`)
        .then(
          (response) => response.json(),
          (error) => console.log('fetch error: ', error),
        )
        .then(
          (json) => {
            json.transactions.sort((a, b) => {
              if (a.date < b.date) {
                return 1;
              }

              if (a.date > b.date) {
                return -1;
              }

              if (a.sortOrder < b.sortOrder) {
                return 1;
              }

              if (a.sortOrder > b.sortOrder) {
                return -1;
              }

              return 0;
            });

            return dispatch(receiveTransactions(categoryId, json));
          },
        )
    );
  }
);

const setAccountSelection = (accountId, tracking) => ({
  type: SELECT_ACCOUNT,
  accountId,
  tracking,
});

const selectAccount = (accountId, tracking) => (
  (dispatch) => {
    dispatch(setAccountSelection(accountId, tracking));
    dispatch(requestTransactions());

    if (tracking === 'Transactions') {
      return (
        fetch(`/account/${accountId}/transactions`)
          .then(
            (response) => response.json(),
            (error) => console.log('fetch error: ', error),
          )
          .then(
            (json) => {
              json.transactions.sort((a, b) => {
                if (a.date < b.date) {
                  return 1;
                }

                if (a.date > b.date) {
                  return -1;
                }

                if (a.sortOrder < b.sortOrder) {
                  return 1;
                }

                if (a.sortOrder > b.sortOrder) {
                  return -1;
                }

                return 0;
              });

              return dispatch(receiveTransactions(null, json));
            },
          )
      );
    }

    return (
      fetch(`/account/${accountId}/balances`)
        .then(
          (response) => response.json(),
          (error) => console.log('fetch error: ', error),
        )
        .then(
          (json) => dispatch(receiveAccountBalances(json)),
        )
    );
  }
);

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
      .catch(() => {
      });
  }
);

const hidePlaidLink = () => ({
  type: HIDE_PLAID_LINK,
});

const relinkInstitution = (institutionId) => (
  (dispatch) => (
    fetch(`/institution/${institutionId}/link_token`)
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
          updateMode: true,
        });
      })
  )
);

const fetchGroups = () => (
  (dispatch, getState) => {
    dispatch(requestGroups());

    return (
      fetch('/groups')
        .then(
          (response) => response.json(),
          (error) => console.log('fetch error: ', error),
        )
        .then(
          (json) => {
            const systemGroup = json.find((g) => g.system);

            const systemIds = {
              systemGroupId: systemGroup.id,
              unassignedId: systemGroup.categories.find((c) => c.system && c.name === 'Unassigned').id,
              fundingPoolId: systemGroup.categories.find((c) => c.system && c.name === 'Funding Pool').id,
            };

            dispatch(receiveSystemIds(systemIds));
            dispatch(receieveGroups(json));

            // If nothing is currently selected then select the unassigned category.
            const state = getState();
            if (state.selections.selectedCategoryId === null) {
              dispatch(selectCategory(systemIds.unassignedId));
            }
          },
        )
    );
  }
);

const addCategory = (category) => ({
  type: ADD_CATEGORY,
  category,
});

const updateCategory = (category) => ({
  type: UPDATE_CATEGORY,
  category,
});

const deleteCategory = (category) => ({
  type: DELETE_CATEGORY,
  category,
});

const requestInstitutions = () => ({
  type: REQUEST_INSTITUTIONS,
});

const receiveInstitutions = (institutions) => ({
  type: RECEIVE_INSTITUTIONS,
  institutions,
});

const fetchInstitutions = () => (
  (dispatch) => {
    dispatch(requestInstitutions());

    return (
      fetch('/connected_accounts')
        .then(
          (response) => response.json(),
          (error) => console.log('fetch error: ', error),
        )
        .then(
          (json) => dispatch(receiveInstitutions(json)),
        )
    );
  }
);

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
            dispatch(selectCategory(state.categoryTree.unassignedId));
          }
        }
        else {
          dispatch(setView(eventKey));
          if (state.selections.selectedCategoryId !== null) {
            dispatch(selectCategory(state.selections.selectedCategoryId));
          }
          else if (state.categoryTree.unassignedId !== null) {
            dispatch(selectCategory(state.categoryTree.unassignedId));
          }
        }

        break;

      case 'accounts':
        dispatch(setView(eventKey));
        if (state.selections.selectedAccountId !== null
          && state.selections.accountTracking !== null) {
          dispatch(selectAccount(
            state.selections.selectedAccountId,
            state.selections.accountTracking,
          ));
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
  addGroup,
  updateGroup,
  deleteGroup,
  fetchGroups,
  addCategory,
  updateCategory,
  deleteCategory,
  fetchInstitutions,
  receiveCategoryBalances,
  receiveTransactionCategories,
  selectCategory,
  selectAccount,
  receiveSystemIds,
  navigate,
  report,
  fetchPlans,
  fetchPlan,
  relinkInstitution,
  showPlaidLink,
  hidePlaidLink,
  accountSynced,
  updatePlanItem,
  refreshAccount,
};
