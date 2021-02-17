import { combineReducers } from 'redux';
import {
  RECEIVE_PLAN,
  UPDATE_PLAN_ITEM,
} from './actionTypes';

function plans(
  state = {
    list: [],
    plan: null,
  },
  action,
) {
  switch (action.type) {
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
  plans,
});

export default budgetApp;
