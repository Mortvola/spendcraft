import { BaseModel, column } from '@adonisjs/lucid/orm';

class CategorySplit extends BaseModel {
  @column()
  public categoryId: number;

  @column()
  public amount: number;
}

export default CategorySplit;
