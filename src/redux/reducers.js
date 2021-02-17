import { combineReducers } from 'redux';
import {
  SET_VIEW,
  RECEIVE_REPORT_DATA,
  RECEIVE_USER,
  RECEIVE_PLANS,
  RECEIVE_PLAN,
  UPDATE_PLAN_ITEM,
} from './actionTypes';

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

const budgetApp = combineReducers({
  selections,
  reports,
  user,
  plans,
});

export default budgetApp;
