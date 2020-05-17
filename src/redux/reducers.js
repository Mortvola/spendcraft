import { combineReducers } from 'redux';
import {
    ADD_GROUP,
    UPDATE_GROUP,
    DELETE_GROUP,
    REQUEST_GROUPS,
    RECEIVE_GROUPS,
    ADD_INSTITUTION,
    UPDATE_INSTITUTION,
} from './actionTypes';

function categories(
    state = {
        systemGroupId: undefined,
        unassignedId: undefined,
        fundingPoolId: undefined,
        groups: [],
    },
    action,
) {
    switch (action.type) {
    case ADD_GROUP: {
        const index = state.groups.findIndex((g) => action.group.name.localeCompare(g.name) < 0);

        if (index === -1) {
            return {
                ...state,
                ...{ groups: state.groups.concat([{ ...action.group, ...{ categories: [] } }]) },
            };
        }

        const groups = state.groups.slice();
        groups.splice(index, 0, { ...action.group, ...{ categories: [] } });

        return {
            ...state,
            ...{ groups },
        };
    }

    case UPDATE_GROUP: {
        const index = state.groups.findIndex((e) => e.id === action.group.id);
        if (index !== -1) {
            const newGroups = state.groups.slice();
            newGroups[index] = { ...newGroups[index], ...action.group };
            return { ...state, ...{ groups: newGroups } };
        }

        return state;
    }

    case DELETE_GROUP: {
        const index = state.groups.findIndex((g) => g.id === action.group.id);
        if (index !== -1) {
            const newGroups = state.groups.slice();
            newGroups.splice(index, 1);
            return { ...state, ...{ groups: newGroups } };
        }

        return state;
    }

    case REQUEST_GROUPS:
        return state;

    case RECEIVE_GROUPS:
    {
        const systemGroup = action.groups.find((g) => g.system);

        return {
            systemGroupId: systemGroup.id,
            unassignedId: systemGroup.categories.find((c) => c.system && c.name === 'Unassigned').id,
            fundingPoolId: systemGroup.categories.find((c) => c.system && c.name === 'Funding Pool').id,
            groups: action.groups,
        };
    }

    default:
        return state;
    }
}

function institutions(state = [], action) {
    switch (action.type) {
    case ADD_INSTITUTION:
        return state.concat([action.institution]);
    case UPDATE_INSTITUTION:
    {
        const index = state.findIndex((e) => e.id === action.institution.id);
        if (index) {
            const newInstutions = state.slice();
            newInstutions[index] = { ...newInstutions[index], ...action.institution };
            return newInstutions;
        }

        return state;
    }
    default:
        return state;
    }
}

const budgetApp = combineReducers({
    categories,
    institutions,
});

export default budgetApp;
