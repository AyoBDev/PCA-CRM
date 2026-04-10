const prisma = require('../lib/prisma');

// POST /api/permanent-links
async function createPermanentLink(req, res, next) {
  try {
    const { clientId, pcaName } = req.body;
    if (!clientId || !pcaName || !pcaName.trim()) {
      return res.status(400).json({ error: 'clientId and pcaName are required' });
    }

    const link = await prisma.permanentLink.create({
      data: { clientId: Number(clientId), pcaName: pcaName.trim() },
      include: { client: true },
    });

    const origin = `${req.protocol}://${req.get('host')}`;
    res.status(201).json({ ...link, url: `${origin}/pca-form/${link.token}` });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A link already exists for this PCA + Client pair' });
    }
    next(err);
  }
}

// GET /api/permanent-links
async function listPermanentLinks(req, res, next) {
  try {
    const links = await prisma.permanentLink.findMany({
      include: { client: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(links);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/permanent-links/:id
async function deletePermanentLink(req, res, next) {
  try {
    const id = Number(req.params.id);
    await prisma.permanentLink.update({
      where: { id },
      data: { active: false },
    });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Link not found' });
    next(err);
  }
}

module.exports = { createPermanentLink, listPermanentLinks, deletePermanentLink };
