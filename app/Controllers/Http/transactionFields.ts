const transactionFields = {
  fields: {
    pick: [
      'id', 'date', 'createdAt', 'sortOrder', 'type', 'comment', 'transactionCategories',
      'duplicateOfTransactionId', 'accountTransaction', 'version',
    ],
  },
  relations: {
    transactionCategories: {
      fields: {
        pick: ['id', 'type', 'categoryId', 'amount', 'expected', 'comment'],
      },
    },
    accountTransaction: {
      fields: {
        pick: [
          'name', 'amount', 'principle', 'paymentChannel', 'reconciled',
          'account', 'location', 'accountOwner', 'pending',
        ],
      },
      relations: {
        account: {
          fields: {
            pick: ['id', 'name', 'institution'],
          },
          relations: {
            institution: {
              fields: {
                pick: ['name'],
              },
            },
          },
        },
      },
    },
  },
};

export default transactionFields;
