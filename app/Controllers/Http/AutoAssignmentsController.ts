import type { HttpContext } from '@adonisjs/core/http'
import { rules, schema } from '@adonisjs/validator';
import db from '@adonisjs/lucid/services/db';
import AutoAssignment from '#app/Models/AutoAssignment';
import AutoAssignmentCategory from '#app/Models/AutoAssignmentCategory';

export default class AutoAssignmentsController {
  // eslint-disable-next-line class-methods-use-this
  public async get({
    request,
    auth: {
      user,
    },
  }: HttpContext): Promise<AutoAssignment | AutoAssignment[]> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const { id } = request.params();

    const budget = await user.related('budget').query()
      .firstOrFail();

    let assignment: AutoAssignment

    if (id) {
      assignment = await budget.related('autoAssignment').query()
        .where('id', id)
        .firstOrFail();

      await assignment.load('categories');
      // await assignment.load('searchStrings');

      return assignment;
    }

    const assignments = await budget.related('autoAssignment').query()
      .orderByRaw('lower(name) asc')
      .preload('categories')

    return assignments;
  }

  // eslint-disable-next-line class-methods-use-this
  public async post({
    request,
    auth: {
      user,
    },
  }: HttpContext): Promise<AutoAssignment> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const requestData = await request.validate({
      schema: schema.create({
        name: schema.string([rules.trim()]),
        searchStrings: schema.array().members(schema.string()),
        categories: schema.array().members(
          schema.object().members({
            id: schema.number(),
            categoryId: schema.number(),
            amount: schema.number(),
            percentage: schema.boolean(),
          }),
        ),
      }),
    });

    const trx = await db.transaction();

    try {
      user.useTransaction(trx)

      const budget = await user.related('budget').query()
        .forUpdate()
        .firstOrFail();

      const autoAssignment = await budget.related('autoAssignment')
        .create({
          name: requestData.name,
          searchStrings: requestData.searchStrings,
        })

      // eslint-disable-next-line no-restricted-syntax
      for (const category of requestData.categories) {
        // eslint-disable-next-line no-await-in-loop
        await autoAssignment.related('categories').create({
          categoryId: category.categoryId,
          amount: category.amount,
          percentage: category.percentage,
        })
      }

      await autoAssignment.load('categories');

      await trx.commit();

      return autoAssignment;
    }
    catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async patch({
    request,
    auth: {
      user,
    },
  }: HttpContext): Promise<AutoAssignment> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const { id } = request.params();
    const requestData = await request.validate({
      schema: schema.create({
        name: schema.string([rules.trim()]),
        searchStrings: schema.array().members(schema.string()),
        categories: schema.array().members(
          schema.object().members({
            id: schema.number(),
            categoryId: schema.number(),
            amount: schema.number(),
            percentage: schema.boolean(),
          }),
        ),
      }),
    });

    const trx = await db.transaction();

    try {
      user.useTransaction(trx)

      await user.related('budget').query()
        .forUpdate()
        .firstOrFail();

      const autoAssignment = await AutoAssignment.findOrFail(id, { client: trx })

      await autoAssignment.merge({
        name: requestData.name,
        searchStrings: requestData.searchStrings,
      })
        .save();

      // eslint-disable-next-line no-restricted-syntax
      for (const category of requestData.categories) {
        if (category.id >= 0) {
          // eslint-disable-next-line no-await-in-loop
          const autoAssignCategory = await AutoAssignmentCategory.findOrFail(category.id, { client: trx })

          // eslint-disable-next-line no-await-in-loop
          await autoAssignCategory.merge({
            categoryId: category.categoryId,
            amount: category.amount,
            percentage: category.percentage,
          })
            .save()
        }
        else {
          // eslint-disable-next-line no-await-in-loop
          const newAutoAssignCat = await autoAssignment.related('categories').create({
            categoryId: category.categoryId,
            amount: category.amount,
            percentage: category.percentage,
          });

          category.id = newAutoAssignCat.id;
        }
      }

      await autoAssignment.related('categories').query()
        .whereNotIn('id', requestData.categories.map((c) => c.id))
        .delete()

      await autoAssignment.load('categories');

      await trx.commit();

      return autoAssignment;
    }
    catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async delete({
    request,
    auth: {
      user,
    },
  }: HttpContext): Promise<void> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const { id } = request.params();

    const trx = await db.transaction();

    try {
      user.useTransaction(trx);

      await user.related('budget').query()
        .forUpdate()
        .firstOrFail();

      const autoAssignment = await AutoAssignment.find(id);

      if (autoAssignment) {
        const categories = await autoAssignment.related('categories').query();

        await Promise.all(categories.map((category) => (
          category.delete()
        )))

        await autoAssignment?.delete();
      }

      await trx.commit();
    }
    catch (error) {
      await trx.rollback();
      throw error;
    }
  }
}
