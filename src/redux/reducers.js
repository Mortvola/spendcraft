import { combineReducers } from 'redux';
import {
    ADD_GROUP,
    UPDATE_GROUP,
    DELETE_GROUP,
    REQUEST_GROUPS,
    RECEIVE_GROUPS,
    ADD_INSTITUTION,
    UPDATE_INSTITUTION,
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
} from './actionTypes';


function categories(
    state = [],
    action,
) {
    if (action !== undefined) {
        switch (action.type) {
        case ADD_CATEGORY: {
            const index = state.findIndex((c) => action.category.name.localeCompare(c.name) < 0);

            if (index === -1) {
                return state.concat([action.category]);
            }

            const cats = state.slice();
            cats.splice(index, 0, action.category);

            return cats;
        }

        case UPDATE_CATEGORY: {
            const index = state.findIndex((c) => c.id === action.category.id);
            if (index !== -1) {
                const cats = state.slice();
                cats[index] = { ...cats[index], ...action.category };
                return cats;
            }

            return state;
        }

        case DELETE_CATEGORY: {
            const index = state.findIndex((c) => c.id === action.category.id);
            if (index !== -1) {
                const cats = state.slice();
                cats.splice(index, 1);
                return cats;
            }

            return state;
        }

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
                ...{
                    groups: state.groups.concat([{
                        ...action.group,
                        ...{ categories: categories() },
                    }]),
                },
            };
        }

        const groups = state.groups.slice();
        groups.splice(index, 0, { ...action.group, ...{ categories: categories() } });

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

    case RECEIVE_GROUPS: {
        return {
            ...state,
            groups: action.groups,
        };
    }

    case RECEIVE_SYSTEM_IDS:

        return {
            ...state,
            systemGroupId: action.systemGroupId,
            unassignedId: action.unassignedId,
            fundingPoolId: action.fundingPoolId,
        };

    case ADD_CATEGORY:
    case UPDATE_CATEGORY:
    case DELETE_CATEGORY:
        return {
            ...state,
            ...{
                groups: state.groups.map((g) => {
                    if (g.id === action.category.groupId) {
                        return ({
                            ...g,
                            ...{ categories: categories(g.categories, action) },
                        });
                    }

                    return g;
                }),
            },
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

function institutions(
    state = [],
    action,
) {
    switch (action.type) {
    case ADD_INSTITUTION:
        return state.concat([action.institution]);

    case UPDATE_INSTITUTION: {
        const index = state.findIndex((e) => e.id === action.institution.id);
        if (index) {
            const newInstutions = state.slice();
            newInstutions[index] = { ...newInstutions[index], ...action.institution };
            return newInstutions;
        }

        return state;
    }

    case REQUEST_INSTITUTIONS:
        return state;

    case RECEIVE_INSTITUTIONS:
        return action.institutions;

    default:
        return state;
    }
}

function transactions(
    state = {
        categoryId: null,
        balance: 0,
        transactions: [],
        pending: [],
    },
    action,
) {
    switch (action.type) {
    case REQUEST_TRANSACTIONS:
        return state;

    case RECEIVE_TRANSACTIONS: {
        if (action.categoryId !== null) {
            return { categoryId: action.categoryId, ...action.transactions };
        }

        return { categoryId: null, ...action.transactions };
    }

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

function balances(
    state = [],
    action,
) {
    switch (action.type) {
    case RECEIVE_ACCOUNT_BALANCES:
        return action.balances;

    default:
        return state;
    }
}


function selections(
    state = {
        selectedCategoryId: null,
        selectedAccountId: null,
        accountTracking: null,
    },
    action,
) {
    switch (action.type) {
    case SELECT_CATEGORY:
        return {
            selectedCategoryId: action.categoryId,
            selectedAccountId: null,
        };

    case SELECT_ACCOUNT:
        return {
            selectedCategoryId: null,
            selectedAccountId: action.accountId,
            accountTracking: action.tracking,
        };

    default:
        return state;
    }
}


const budgetApp = combineReducers({
    categoryTree,
    institutions,
    transactions,
    balances,
    selections,
});

export default budgetApp;
