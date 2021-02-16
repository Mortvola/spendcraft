import { combineReducers } from 'redux';
import {
  RECEIVE_CATEGORY_BALANCES,
  RECEIVE_TRANSACTION_CATEGORIES,
  RECEIVE_SYSTEM_IDS,
  SET_VIEW,
  RECEIVE_REPORT_DATA,
  RECEIVE_USER,
  RECEIVE_PLANS,
  RECEIVE_PLAN,
  SHOW_PLAID_LINK,
  HIDE_PLAID_LINK,
  UPDATE_PLAN_ITEM,
} from './actionTypes';

function categories(
  state = [],
  action,
) {
  if (action !== undefined) {
    switch (action.type) {
      case RECEIVE_CATEGORY_BALANCES:
        return state.map((c) => {
          const balance = action.balances.find((b) => b.id === c.id);

          if (balance) {
            return ({
              ...c,
              amount: balance.amount,
            });
          }

          return c;
        });

      default:
        return state;
    }
  }

  return state;
}

function categoryTree(
  state = {
    systemGroupId: null,
    unassignedId: null,
    fundingPoolId: null,
    groups: [],
  },
  action,
) {
  switch (action.type) {
    case RECEIVE_SYSTEM_IDS:

      return {
        ...state,
        systemGroupId: action.systemGroupId,
        unassignedId: action.unassignedId,
        fundingPoolId: action.fundingPoolId,
      };

    case RECEIVE_CATEGORY_BALANCES:
      return {
        ...state,
        ...{
          groups: state.groups.map((g) => ({
            ...g,
            ...{ categories: categories(g.categories, action) },
          })),
        },
      };

    default:
      return state;
  }
}

function transactions(
  state = {
    fetching: false,
    categoryId: null,
    balance: 0,
    transactions: [],
    pending: [],
  },
  action,
) {
  switch (action.type) {
    case RECEIVE_CATEGORY_BALANCES:
      if (state.categoryId !== null) {
        const balance = action.balances.find((b) => b.id === state.categoryId);

        if (balance) {
          return {
            ...state,
            balance: balance.amount,
          };
        }
      }

      return state;

    case RECEIVE_TRANSACTION_CATEGORIES: {
      const index = state.transactions.findIndex((t) => t.id === action.transCategories.id);
      if (index !== -1) {
        if (state.categoryId !== null) {
          // If the new transaction categories don't include
          // the current category then remove the transactions.
          if (!action.transCategories.splits.some((c) => (
            c.categoryId === state.categoryId
          ))) {
            const newTransactions = state.transactions.slice();
            newTransactions.splice(index, 1);
            return {
              ...state,
              transactions: newTransactions,
            };
          }
        }

        return {
          ...state,
          transactions: [
            ...state.transactions.slice(0, index),
            { ...state.transactions[index], categories: action.transCategories.splits },
            ...state.transactions.slice(index + 1)],
        };
      }

      return state;
    }

    default:
      return state;
  }
}

function selections(
  state = {
    view: 'home',
    selectedCategoryId: null,
    selectedAccountId: null,
    accountTracking: null,
  },
  action,
) {
  switch (action.type) {
    case SET_VIEW:
      return {
        ...state,
        view: action.view,
      };

    default:
      return state;
  }
}

function reports(
  state = {
    data: null,
    reportType: null,
  },
  action,
) {
  switch (action.type) {
    case RECEIVE_REPORT_DATA:
      return {
        ...state,
        data: action.data,
        reportType: action.reportType,
      };

    default:
      return state;
  }
}

function user(
  state = null,
  action,
) {
  switch (action.type) {
    case RECEIVE_USER:
      return { username: action.user };

    default:
      return state;
  }
}

function plans(
  state = {
    list: [],
    plan: null,
  },
  action,
) {
  switch (action.type) {
    case RECEIVE_PLANS:
      return {
        ...state,
        list: action.plans,
      };

    case RECEIVE_PLAN:
      return {
        ...state,
        plan: action.plan,
      };

    case UPDATE_PLAN_ITEM: {
      let categoryIndex;
      const groupIndex = state.plan.groups.findIndex((g) => {
        categoryIndex = g.categories.findIndex((c) => c.categoryId === action.category.categoryId);

        return categoryIndex !== -1;
      });

      if (groupIndex !== -1) {
        return {
          ...state,
          plan: {
            ...state.plan,
            groups: [
              ...state.plan.groups.slice(0, groupIndex),
              {
                ...state.plan.groups[groupIndex],
                categories: [
                  ...state.plan.groups[groupIndex].categories.slice(0, categoryIndex),
                  {
                    ...state.plan.groups[groupIndex].categories[categoryIndex],
                    ...action.category,
                  },
                  ...state.plan.groups[groupIndex].categories.slice(categoryIndex + 1),
                ],
              },
              ...state.plan.groups.slice(groupIndex + 1),
            ],
          },
        };
      }

      return state;
    }

    default:
      return state;
  }
}

function dialogs(
  state = {
    plaid: {
      show: false,
      publicToken: null,
    },
  },
  action,
) {
  switch (action.type) {
    case SHOW_PLAID_LINK:
      return {
        ...state,
        plaid: {
          show: true,
          linkToken: action.linkToken,
          updateMode: action.updateMode,
        },
      };

    case HIDE_PLAID_LINK: {
      return {
        ...state,
        plaid: { ...state.plaid, show: false },
      };
    }

    default:
      return state;
  }
}

const budgetApp = combineReducers({
  categoryTree,
  transactions,
  selections,
  reports,
  user,
  plans,
  dialogs,
});

export default budgetApp;
