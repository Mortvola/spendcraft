import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db';
import AutoAssignment from '#app/Models/AutoAssignment';
import AutoAssignmentCategory from '#app/Models/AutoAssignmentCategory';
import { addAutoAssignment, updateAutoAssignment } from '#validators/autoAssignment';

export default class AutoAssignmentsController {
   
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

   
  public async post({
    request,
    auth: {
      user,
    },
  }: HttpContext): Promise<AutoAssignment> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const requestData = await request.validateUsing(
      addAutoAssignment
    );

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

       
      for (const category of requestData.categories) {
         
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
    const requestData = await request.validateUsing(
      updateAutoAssignment
    );

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

       
      for (const category of requestData.categories) {
        if (category.id >= 0) {
           
          const autoAssignCategory = await AutoAssignmentCategory.findOrFail(category.id, { client: trx })

           
          await autoAssignCategory.merge({
            categoryId: category.categoryId,
            amount: category.amount,
            percentage: category.percentage,
          })
            .save()
        }
        else {
           
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
