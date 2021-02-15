import { combineReducers } from 'redux';
import {
  ADD_INSTITUTION,
  UPDATE_INSTITUTION,
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
  ACCOUNT_SYNCED,
  UPDATE_PLAN_ITEM,
  ACCOUNT_REFRESHING,
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

function accounts(
  state = [],
  action,
) {
  switch (action.type) {
    case ACCOUNT_SYNCED: {
      const index = state.findIndex((a) => a.id === action.accountId);
      if (index !== -1) {
        const newAccounts = state.slice();
        newAccounts[index] = {
          ...newAccounts[index],
          balance: action.balance,
          syncDate: action.syncDate,
        };
        return newAccounts;
      }

      return state;
    }

    case ACCOUNT_REFRESHING: {
      const index = state.findIndex((a) => a.id === action.accountId);
      if (index !== -1) {
        return [
          ...state.slice(0, index),
          {
            ...state[index],
            refreshing: action.refreshing,
          },
          ...state.slice(index + 1),
        ];
      }

      return state;
    }

    default:
      return state;
  }
}

function institutions(
  state = [],
  action,
) {
  switch (action.type) {
    case ADD_INSTITUTION: {
      const index = state.findIndex(
        (inst) => action.institution.name.localeCompare(inst.name) < 0,
      );

      if (index === -1) {
        return state.concat([action.institution]);
      }

      const insts = state.slice();
      insts.splice(index, 0, action.institution);

      return insts;
    }

    case UPDATE_INSTITUTION: {
      const index = state.findIndex((e) => e.id === action.institution.id);
      if (index) {
        const newInstutions = state.slice();
        newInstutions[index] = { ...newInstutions[index], ...action.institution };
        return newInstutions;
      }

      return state;
    }

    default: {
      if (action.institutionId !== undefined) {
        const index = state.findIndex((e) => e.id === action.institutionId);
        if (index !== -1) {
          return [
            ...state.slice(0, index),
            {
              ...state[index],
              accounts: accounts(state[index].accounts, action),
            },
            ...state.slice(index + 1),
          ];
        }
      }

      return state;
    }
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
  institutions,
  transactions,
  selections,
  reports,
  user,
  plans,
  dialogs,
});

export default budgetApp;
